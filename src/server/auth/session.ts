import "server-only"
import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { randomToken, sha256Hex } from "@/server/crypto/tokens"
import type { Executor } from "@/server/db/client"
import { sessions, users, workspaceMembers, workspaces, type WorkspaceRole } from "@/server/db/schema"

/** A session ends after 12 idle hours or 7 days, whichever comes first. */
export const SESSION_IDLE_SECONDS = 12 * 60 * 60
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60
/** last_seen_at is written at most this often, not on every request. */
export const LAST_SEEN_WRITE_INTERVAL_SECONDS = 5 * 60

export interface SessionContext {
  sessionId: string
  userId: string
  login: string
  displayName: string
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  role: WorkspaceRole
  csrfTokenHash: string
  expiresAt: Date
}

export interface IssuedSession {
  sessionId: string
  /** Raw tokens: returned once, for the Set-Cookie headers. Never stored or logged. */
  token: string
  csrfToken: string
  maxAgeSeconds: number
}

export async function createSession(executor: Executor, userId: string): Promise<IssuedSession> {
  const token = randomToken(32)
  const csrfToken = randomToken(32)
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_SECONDS * 1000)
  const [row] = await executor
    .insert(sessions)
    .values({ userId, tokenHash: sha256Hex(token), csrfTokenHash: sha256Hex(csrfToken), expiresAt })
    .returning({ id: sessions.id })
  return { sessionId: row.id, token, csrfToken, maxAgeSeconds: SESSION_ABSOLUTE_SECONDS }
}

/**
 * Resolves a raw session token to a live session, or null. A session is live when it is
 * not revoked, not past its absolute expiry, not idle too long, and its user is enabled.
 */
export async function resolveSession(executor: Executor, token: string | null): Promise<SessionContext | null> {
  if (!token || token.length > 200) return null
  const rows = await executor
    .select({
      sessionId: sessions.id,
      userId: users.id,
      login: users.login,
      displayName: users.displayName,
      disabledAt: users.disabledAt,
      csrfTokenHash: sessions.csrfTokenHash,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      revokedAt: sessions.revokedAt,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      role: workspaceMembers.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(sessions.tokenHash, sha256Hex(token)))
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const now = Date.now()
  if (row.revokedAt || row.disabledAt) return null
  if (row.expiresAt.getTime() <= now) return null
  if (row.lastSeenAt.getTime() + SESSION_IDLE_SECONDS * 1000 <= now) return null
  if (row.lastSeenAt.getTime() + LAST_SEEN_WRITE_INTERVAL_SECONDS * 1000 <= now) {
    await executor.update(sessions).set({ lastSeenAt: sql`now()` }).where(eq(sessions.id, row.sessionId))
  }
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    login: row.login,
    displayName: row.displayName,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    workspaceSlug: row.workspaceSlug,
    role: row.role,
    csrfTokenHash: row.csrfTokenHash,
    expiresAt: row.expiresAt,
  }
}

export async function revokeSession(executor: Executor, sessionId: string): Promise<void> {
  await executor.update(sessions).set({ revokedAt: sql`now()` }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
}
