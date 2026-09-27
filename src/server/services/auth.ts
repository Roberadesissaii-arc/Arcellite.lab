import "server-only"
import { count, eq, sql } from "drizzle-orm"
import type { AuthMeDTO, BootstrapRequest, LoginRequest } from "@/lib/api/contracts/auth"
import { ApiFailure } from "@/server/api/failure"
import { writeAudit } from "@/server/audit/audit"
import { capabilitiesFor } from "@/server/auth/authorize"
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/auth/password"
import { createSession, revokeSession, type IssuedSession, type SessionContext } from "@/server/auth/session"
import { sha256Hex } from "@/server/crypto/tokens"
import { db } from "@/server/db/client"
import { userPreferences, users, workspaceMembers, workspaces, workspaceSettings } from "@/server/db/schema"
import { attemptsInWindow, LOGIN_POLICY, recordAttempt, resetAttempts } from "@/server/security/rate-limit"
import { recordActivity } from "./activity"

export const DEFAULT_WORKSPACE = { name: "Arcellite Lab", slug: "arcellite-lab" }
const INVALID_CREDENTIALS = "Invalid credentials."

/** The sign-in identity: NFKC-normalized, trimmed, lowercased. */
export function normalizeLogin(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase()
}

export async function isSetupRequired(): Promise<boolean> {
  const [row] = await db().select({ total: count() }).from(users)
  return Number(row?.total ?? 0) === 0
}

/**
 * Creates the first owner, the default workspace, and a session, atomically. A transaction
 * advisory lock serializes concurrent attempts, and the user count is checked while holding
 * it, so two simultaneous requests can never both become the initial owner.
 */
export async function bootstrapOwner(input: BootstrapRequest, requestId: string): Promise<{ session: IssuedSession; userId: string }> {
  const passwordHash = await hashPassword(input.password)
  const result = await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('arcellite:bootstrap'))`)
    const [existing] = await tx.select({ total: count() }).from(users)
    if (Number(existing?.total ?? 0) > 0) return null
    const [user] = await tx
      .insert(users)
      .values({ login: input.login.trim(), loginNormalized: normalizeLogin(input.login), displayName: input.displayName.trim(), passwordHash })
      .returning({ id: users.id })
    const [workspace] = await tx.insert(workspaces).values(DEFAULT_WORKSPACE).returning({ id: workspaces.id })
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
    await tx.insert(workspaceSettings).values({ workspaceId: workspace.id })
    await tx.insert(userPreferences).values({ userId: user.id })
    const session = await createSession(tx, user.id)
    await writeAudit(tx, {
      workspaceId: workspace.id,
      actorUserId: user.id,
      action: "auth.bootstrap",
      outcome: "success",
      objectType: "user",
      objectId: user.id,
      requestId,
      metadata: { role: "owner" },
    })
    await recordActivity(tx, { workspaceId: workspace.id, userId: user.id, displayName: input.displayName.trim() }, {
      action: "Workspace created",
      result: "success",
      objectType: "Workspace",
      objectId: workspace.id,
      objectName: DEFAULT_WORKSPACE.name,
      detail: "Owner account set up.",
    })
    return { session, userId: user.id }
  })
  if (!result) {
    await writeAudit(db(), { workspaceId: null, actorUserId: null, action: "auth.bootstrap", outcome: "denied", requestId, metadata: { reason: "already_bootstrapped" } })
    throw new ApiFailure("CONFLICT", "Setup is already complete. Sign in instead.")
  }
  return result
}

/**
 * Verifies credentials and opens a session. Failures are throttled per normalized identity
 * in PostgreSQL and always answer with the same generic message; an unknown identity burns
 * the same hashing cost as a wrong password.
 */
export async function login(input: LoginRequest, requestId: string): Promise<{ session: IssuedSession; userId: string }> {
  const identity = normalizeLogin(input.login)
  const throttleKey = `login:${sha256Hex(identity)}`
  const window = await attemptsInWindow(db(), throttleKey, LOGIN_POLICY)
  if (window.count >= LOGIN_POLICY.limit) {
    await writeAudit(db(), { workspaceId: null, actorUserId: null, action: "auth.login", outcome: "denied", requestId, metadata: { reason: "throttled" } })
    throw new ApiFailure("RATE_LIMITED", "Too many sign-in attempts. Try again later.", { headers: { "Retry-After": String(window.retryAfterSeconds) } })
  }
  const [user] = await db().select().from(users).where(eq(users.loginNormalized, identity)).limit(1)
  const valid = user ? await verifyPassword(user.passwordHash, input.password) : (await verifyAgainstDummy(input.password), false)
  if (!user || !valid || user.disabledAt) {
    await recordAttempt(db(), throttleKey, LOGIN_POLICY)
    await writeAudit(db(), {
      workspaceId: null,
      actorUserId: null,
      action: "auth.login",
      outcome: "failure",
      objectType: user ? "user" : null,
      objectId: user?.id ?? null,
      requestId,
      metadata: { reason: user?.disabledAt ? "disabled" : "invalid_credentials" },
    })
    throw new ApiFailure("UNAUTHORIZED", INVALID_CREDENTIALS)
  }
  return db().transaction(async (tx) => {
    await resetAttempts(tx, throttleKey)
    const session = await createSession(tx, user.id)
    const [membership] = await tx.select({ workspaceId: workspaceMembers.workspaceId }).from(workspaceMembers).where(eq(workspaceMembers.userId, user.id)).limit(1)
    await writeAudit(tx, { workspaceId: membership?.workspaceId ?? null, actorUserId: user.id, action: "auth.login", outcome: "success", objectType: "user", objectId: user.id, requestId })
    return { session, userId: user.id }
  })
}

export async function logout(session: SessionContext, requestId: string): Promise<void> {
  await db().transaction(async (tx) => {
    await revokeSession(tx, session.sessionId)
    await writeAudit(tx, { workspaceId: session.workspaceId, actorUserId: session.userId, action: "auth.logout", outcome: "success", objectType: "session", objectId: session.sessionId, requestId })
  })
}

export function describeSession(session: SessionContext): AuthMeDTO {
  return {
    user: { id: session.userId, login: session.login, displayName: session.displayName },
    workspace: { id: session.workspaceId, name: session.workspaceName, slug: session.workspaceSlug },
    role: session.role,
    capabilities: capabilitiesFor(session.role),
  }
}
