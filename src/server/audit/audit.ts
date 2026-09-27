import "server-only"
import type { Executor } from "@/server/db/client"
import { auditLog } from "@/server/db/schema"
import { redact } from "@/server/security/log"

export interface AuditEntry {
  workspaceId: string | null
  /** Null for anonymous (failed sign-in) or system actions. */
  actorUserId: string | null
  actorKind?: "user" | "system" | "anonymous"
  action: string
  outcome: "success" | "failure" | "denied"
  objectType?: string | null
  objectId?: string | null
  requestId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Appends a security audit record. Metadata passes through the log redactor, so a field
 * named like a secret (password, token, value, …) is stored as "[redacted]" even if a
 * caller passes it by mistake.
 */
export async function writeAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({
    workspaceId: entry.workspaceId,
    actorUserId: entry.actorUserId,
    actorKind: entry.actorKind ?? (entry.actorUserId ? "user" : "anonymous"),
    action: entry.action,
    outcome: entry.outcome,
    objectType: entry.objectType ?? null,
    objectId: entry.objectId ?? null,
    requestId: entry.requestId ?? null,
    metadata: (redact(entry.metadata ?? {}) as Record<string, unknown>) ?? {},
  })
}
