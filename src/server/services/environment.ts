import "server-only"
import { randomUUID } from "node:crypto"
import { and, asc, eq, sql } from "drizzle-orm"
import type { EnvVarCreate, EnvVarDTO, EnvVarPatch } from "@/lib/api/contracts/environment"
import type { RevealSecretResponse } from "@/lib/api/contracts/auth"
import { ApiFailure, notFound } from "@/server/api/failure"
import { writeAudit } from "@/server/audit/audit"
import { requireCapability, type Actor } from "@/server/auth/authorize"
import { verifyPassword } from "@/server/auth/password"
import { secretBox, type SealedValue } from "@/server/crypto/secret-box"
import { db, type Tx } from "@/server/db/client"
import { environmentVariables, users } from "@/server/db/schema"
import { publishEvent } from "@/server/events/publish"
import { recordAttempt, REVEAL_POLICY } from "@/server/security/rate-limit"
import { recordActivity } from "./activity"
import { findProject } from "./projects"

type VariableRow = typeof environmentVariables.$inferSelect

/** Binds a ciphertext to its row: moving it to another variable makes it undecryptable. */
function associatedData(projectId: string, variableId: string): string {
  return `arcellite:env:${projectId}:${variableId}`
}

function sealed(row: VariableRow): SealedValue {
  return { ciphertext: row.valueCiphertext, nonce: row.valueNonce, tag: row.valueTag, keyVersion: row.keyVersion }
}

function seal(projectId: string, variableId: string, value: string) {
  const box = secretBox().seal(value, associatedData(projectId, variableId))
  return { valueCiphertext: box.ciphertext, valueNonce: box.nonce, valueTag: box.tag, keyVersion: box.keyVersion }
}

/**
 * Browser representation. Secrets report only that a value exists. Plain values are
 * decrypted because the UI displays them; they are encrypted at rest all the same.
 */
function toEnvVarDTO(row: VariableRow): EnvVarDTO {
  const base = { id: row.id, key: row.key, scope: row.scope as EnvVarDTO["scope"] }
  if (row.secret) return { ...base, secret: true, hasValue: row.valueCiphertext.length > 0 }
  return { ...base, secret: false, value: secretBox().open(sealed(row), associatedData(row.projectId, row.id)) }
}

async function requireProject(tx: Tx | ReturnType<typeof db>, actor: Actor, projectId: string) {
  const project = await findProject(tx, actor.workspaceId, projectId)
  if (!project) throw notFound("That project")
  return project
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const code = "code" in error ? error.code : "cause" in error && typeof error.cause === "object" && error.cause && "code" in error.cause ? error.cause.code : undefined
  return code === "23505"
}

function duplicate(key: string): ApiFailure {
  return new ApiFailure("CONFLICT", `${key} already exists for that scope.`, { details: { field: "key" } })
}

export async function listEnvironment(actor: Actor, projectId: string): Promise<EnvVarDTO[]> {
  await requireCapability(actor, "read_project")
  await requireProject(db(), actor, projectId)
  const rows = await db().select().from(environmentVariables).where(eq(environmentVariables.projectId, projectId)).orderBy(asc(environmentVariables.createdAt))
  return rows.map(toEnvVarDTO)
}

async function afterChange(tx: Tx, actor: Actor, projectId: string, projectName: string, action: string, variable: { id: string; key: string; scope: string; secret: boolean }, eventType: "environment.updated" | "environment.deleted") {
  await recordActivity(tx, actor, { action: eventType === "environment.deleted" ? "Environment variable removed" : "Environment variable updated", result: "info", objectType: "Project", objectId: projectId, objectName: projectName, href: `/projects/${projectId}/environment`, detail: variable.key })
  // Key names and flags only: values never enter audit, activity, or events.
  await writeAudit(tx, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action, outcome: "success", objectType: "environment_variable", objectId: variable.id, requestId: actor.requestId, metadata: { projectId, key: variable.key, scope: variable.scope, kind: variable.secret ? "secret" : "plain" } })
  await publishEvent(tx, { workspaceId: actor.workspaceId, type: eventType, objectType: "environment_variable", objectId: variable.id, payload: { projectId, key: variable.key } })
}

export async function getVariable(actor: Actor, projectId: string, variableId: string): Promise<EnvVarDTO> {
  await requireCapability(actor, "read_project")
  await requireProject(db(), actor, projectId)
  const [row] = await db().select().from(environmentVariables).where(and(eq(environmentVariables.id, variableId), eq(environmentVariables.projectId, projectId))).limit(1)
  if (!row) throw notFound("That variable")
  return toEnvVarDTO(row)
}

export async function createVariable(tx: Tx, actor: Actor, projectId: string, input: EnvVarCreate): Promise<EnvVarDTO> {
  await requireCapability(actor, "edit_environment")
  const project = await requireProject(tx, actor, projectId)
  const id = randomUUID()
  const [existing] = await tx.select({ id: environmentVariables.id }).from(environmentVariables).where(and(eq(environmentVariables.projectId, projectId), eq(environmentVariables.key, input.key), eq(environmentVariables.scope, input.scope))).limit(1)
  if (existing) throw duplicate(input.key)
  const [row] = await tx
    .insert(environmentVariables)
    .values({ id, projectId, key: input.key, scope: input.scope, secret: input.secret, ...seal(projectId, id, input.value), createdBy: actor.userId, updatedBy: actor.userId })
    .returning()
  await afterChange(tx, actor, projectId, project.project.name, "environment.create", row, "environment.updated")
  return toEnvVarDTO(row)
}

export async function updateVariable(actor: Actor, projectId: string, variableId: string, patch: EnvVarPatch): Promise<EnvVarDTO> {
  await requireCapability(actor, "edit_environment")
  try {
    return await db().transaction(async (tx) => {
      const project = await requireProject(tx, actor, projectId)
      const [current] = await tx.select().from(environmentVariables).where(and(eq(environmentVariables.id, variableId), eq(environmentVariables.projectId, projectId))).for("update")
      if (!current) throw notFound("That variable")
      const [row] = await tx
        .update(environmentVariables)
        .set({
          ...(patch.key !== undefined ? { key: patch.key } : {}),
          ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
          ...(patch.secret !== undefined ? { secret: patch.secret } : {}),
          // A supplied value replaces the ciphertext; an omitted value keeps it untouched.
          ...(patch.value !== undefined ? seal(projectId, variableId, patch.value) : {}),
          updatedBy: actor.userId,
          updatedAt: sql`now()`,
        })
        .where(eq(environmentVariables.id, variableId))
        .returning()
      await afterChange(tx, actor, projectId, project.project.name, "environment.update", row, "environment.updated")
      return toEnvVarDTO(row)
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate(patch.key ?? "That variable")
    throw error
  }
}

export async function deleteVariable(actor: Actor, projectId: string, variableId: string): Promise<void> {
  await requireCapability(actor, "edit_environment")
  await db().transaction(async (tx) => {
    const project = await requireProject(tx, actor, projectId)
    const [row] = await tx.delete(environmentVariables).where(and(eq(environmentVariables.id, variableId), eq(environmentVariables.projectId, projectId))).returning()
    if (!row) throw notFound("That variable")
    await afterChange(tx, actor, projectId, project.project.name, "environment.delete", row, "environment.deleted")
  })
}

/**
 * Returns a stored value once, to its owner, after re-checking the current password.
 * Every attempt counts against a per-person limit and is audited (without the value).
 */
export async function revealVariable(actor: Actor, projectId: string, variableId: string, password: string): Promise<RevealSecretResponse> {
  await requireCapability(actor, "view_secret")
  const attempts = await recordAttempt(db(), `reveal:${actor.userId}`, REVEAL_POLICY)
  if (attempts > REVEAL_POLICY.limit) {
    await writeAudit(db(), { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "secret.reveal", outcome: "denied", objectType: "environment_variable", objectId: variableId, requestId: actor.requestId, metadata: { projectId, reason: "throttled" } })
    throw new ApiFailure("RATE_LIMITED", "Too many reveal attempts. Try again later.")
  }
  await requireProject(db(), actor, projectId)
  const [row] = await db().select().from(environmentVariables).where(and(eq(environmentVariables.id, variableId), eq(environmentVariables.projectId, projectId))).limit(1)
  if (!row) throw notFound("That variable")
  const [user] = await db().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, actor.userId)).limit(1)
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    await writeAudit(db(), { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "secret.reveal", outcome: "failure", objectType: "environment_variable", objectId: variableId, requestId: actor.requestId, metadata: { projectId, key: row.key, reason: "wrong_password" } })
    throw new ApiFailure("FORBIDDEN", "That password is not correct.", { details: { field: "password" } })
  }
  const value = secretBox().open(sealed(row), associatedData(projectId, variableId))
  await writeAudit(db(), { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "secret.reveal", outcome: "success", objectType: "environment_variable", objectId: variableId, requestId: actor.requestId, metadata: { projectId, key: row.key } })
  return { id: row.id, key: row.key, value }
}
