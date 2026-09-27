import "server-only"
import { and, eq, lt, sql } from "drizzle-orm"
import { ApiFailure } from "@/server/api/failure"
import type { Actor } from "@/server/auth/authorize"
import { keyedDigest } from "@/server/crypto/secret-box"
import { db, type Tx } from "@/server/db/client"
import { idempotencyKeys } from "@/server/db/schema"

/** How long a key's result is kept for replay. */
export const IDEMPOTENCY_TTL_HOURS = 24

export interface OperationResult<T> {
  status: number
  body: T
  /** True when the stored result of an earlier request was returned. */
  replayed: boolean
}

/** Deterministic JSON: object keys sorted, so equal requests hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`
}

export function validateIdempotencyKey(key: string | null): string | null {
  if (key === null) return null
  if (!/^[\x21-\x7e]{1,255}$/.test(key)) {
    throw new ApiFailure("VALIDATION_FAILED", "Idempotency-Key must be 1–255 visible ASCII characters.")
  }
  return key
}

/**
 * Runs `operation` at most once per (workspace, operation name, key).
 *
 * The key row is inserted in the same transaction as the operation. A concurrent request
 * with the same key blocks on the unique index until the first transaction finishes, then
 * sees its committed row and replays the stored response. If the first transaction rolls
 * back, its row disappears and the waiting request runs the operation itself. The same key
 * with a different request body is a conflict. Only successful results are stored.
 */
export async function runIdempotent<T>(
  actor: Actor,
  name: string,
  key: string | null,
  request: unknown,
  operation: (tx: Tx) => Promise<{ status: number; body: T }>,
): Promise<OperationResult<T>> {
  if (key === null) {
    const result = await db().transaction(operation)
    return { ...result, replayed: false }
  }
  const requestHash = keyedDigest(`${name}\n${stableStringify(request)}`)
  return db().transaction(async (tx) => {
    await tx
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.workspaceId, actor.workspaceId),
          eq(idempotencyKeys.operation, name),
          eq(idempotencyKeys.key, key),
          lt(idempotencyKeys.expiresAt, sql`now()`),
        ),
      )
    const inserted = await tx
      .insert(idempotencyKeys)
      .values({
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        operation: name,
        key,
        requestHash,
        responseStatus: 0,
        responseBody: {},
        expiresAt: sql`now() + make_interval(hours => ${IDEMPOTENCY_TTL_HOURS})`,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeys.id })
    if (!inserted.length) {
      const [existing] = await tx
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.workspaceId, actor.workspaceId), eq(idempotencyKeys.operation, name), eq(idempotencyKeys.key, key)))
      if (!existing || existing.requestHash !== requestHash) {
        throw new ApiFailure("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different request.")
      }
      return { status: existing.responseStatus, body: existing.responseBody as T, replayed: true }
    }
    const result = await operation(tx)
    await tx
      .update(idempotencyKeys)
      .set({ responseStatus: result.status, responseBody: result.body as object })
      .where(eq(idempotencyKeys.id, inserted[0].id))
    return { ...result, replayed: false }
  })
}
