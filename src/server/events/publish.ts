import "server-only"
import { sql } from "drizzle-orm"
import type { EventType } from "@/lib/api/contracts/event"
import type { Executor } from "@/server/db/client"
import { events } from "@/server/db/schema"

export const EVENTS_CHANNEL = "arcellite_events"

export interface EventInput {
  workspaceId: string
  type: EventType
  objectType: string
  objectId?: string | null
  /** Identifiers and names only. Never secret values. */
  payload?: Record<string, unknown>
}

/**
 * Appends a durable event and wakes listeners. Called inside the transaction that made the
 * change: PostgreSQL delivers NOTIFY only when that transaction commits, so listeners never
 * hear about a change that rolled back.
 */
export async function publishEvent(executor: Executor, input: EventInput): Promise<number> {
  const [row] = await executor
    .insert(events)
    .values({
      workspaceId: input.workspaceId,
      type: input.type,
      objectType: input.objectType,
      objectId: input.objectId ?? null,
      payload: input.payload ?? {},
    })
    .returning({ seq: events.seq })
  const message = JSON.stringify({ workspaceId: input.workspaceId, seq: row.seq })
  await executor.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${message})`)
  return row.seq
}
