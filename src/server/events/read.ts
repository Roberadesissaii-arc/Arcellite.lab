import "server-only"
import { and, asc, eq, gt, max } from "drizzle-orm"
import type { EventDTO } from "@/lib/api/contracts/event"
import type { Executor } from "@/server/db/client"
import { events } from "@/server/db/schema"

export async function latestSeq(executor: Executor, workspaceId: string): Promise<number> {
  const [row] = await executor.select({ seq: max(events.seq) }).from(events).where(eq(events.workspaceId, workspaceId))
  return Number(row?.seq ?? 0)
}

/** Events after `seq`, oldest first, for one workspace only. */
export async function eventsAfter(executor: Executor, workspaceId: string, seq: number, limit: number): Promise<EventDTO[]> {
  const rows = await executor
    .select()
    .from(events)
    .where(and(eq(events.workspaceId, workspaceId), gt(events.seq, seq)))
    .orderBy(asc(events.seq))
    .limit(limit)
  return rows.map((row) => ({
    seq: row.seq,
    id: row.id,
    type: row.type as EventDTO["type"],
    objectType: row.objectType,
    objectId: row.objectId,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  }))
}
