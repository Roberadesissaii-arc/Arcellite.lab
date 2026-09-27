import "server-only"
import { desc, eq } from "drizzle-orm"
import type { AuditEntryDTO } from "@/lib/api/contracts/audit"
import { requireCapability, type Actor } from "@/server/auth/authorize"
import { db } from "@/server/db/client"
import { auditLog } from "@/server/db/schema"

export async function listAudit(actor: Actor, limit = 200): Promise<AuditEntryDTO[]> {
  await requireCapability(actor, "read_audit")
  const rows = await db().select().from(auditLog).where(eq(auditLog.workspaceId, actor.workspaceId)).orderBy(desc(auditLog.createdAt)).limit(Math.min(Math.max(limit, 1), 500))
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    outcome: row.outcome as AuditEntryDTO["outcome"],
    actorKind: row.actorKind as AuditEntryDTO["actorKind"],
    actorUserId: row.actorUserId,
    objectType: row.objectType,
    objectId: row.objectId,
    requestId: row.requestId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }))
}
