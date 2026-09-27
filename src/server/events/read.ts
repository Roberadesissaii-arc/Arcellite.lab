import "server-only"
import { and, asc, eq, gt, max, sql } from "drizzle-orm"
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

/**
 * Bounds for a valid replay cursor. `floor` is the highest seq that may have been pruned
 * (anything at or below it could be missing); `ceiling` is the highest seq ever issued.
 * A cursor outside [floor, ceiling] cannot be replayed faithfully and needs a resync.
 */
export async function replayBounds(executor: Executor): Promise<{ floor: number; ceiling: number }> {
  const result = await executor.execute<{ oldest: string | null; last: string }>(sql`
    select (select min(seq) from events) as oldest,
           (select case when is_called then last_value else 0 end from events_seq_seq) as last
  `)
  const row = result.rows[0]
  const ceiling = Number(row?.last ?? 0)
  const floor = row?.oldest == null ? ceiling : Number(row.oldest) - 1
  return { floor, ceiling }
}
