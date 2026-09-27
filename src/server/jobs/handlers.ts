import "server-only"
import { and, isNotNull, lt, or, sql } from "drizzle-orm"
import { db } from "@/server/db/client"
import { events, idempotencyKeys, jobs, rateLimits, sessions } from "@/server/db/schema"

export const HOUSEKEEPING_JOB = "housekeeping.cleanup"
export const NOOP_JOB = "control-plane.noop"

/** Retention for rows that exist only to support replay or history. */
export const EVENT_RETENTION_DAYS = 14
export const JOB_RETENTION_DAYS = 30

export interface JobContext {
  payload: Record<string, unknown>
  signal: AbortSignal
}

export type JobHandler = (context: JobContext) => Promise<Record<string, unknown>>

/**
 * The only work this phase's worker performs. There is deliberately no handler that
 * touches Docker, the network, the filesystem, or a shell.
 */
export const JOB_HANDLERS: Record<string, JobHandler> = {
  [NOOP_JOB]: async () => ({ ok: true }),
  [HOUSEKEEPING_JOB]: async () => {
    const database = db()
    const expiredSessions = await database
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, sql`now() - interval '1 day'`), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, sql`now() - interval '1 day'`)), lt(sessions.lastSeenAt, sql`now() - interval '2 days'`)))
      .returning({ id: sessions.id })
    const expiredKeys = await database.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, sql`now()`)).returning({ id: idempotencyKeys.id })
    const oldEvents = await database.delete(events).where(lt(events.createdAt, sql`now() - make_interval(days => ${EVENT_RETENTION_DAYS})`)).returning({ seq: events.seq })
    const staleLimits = await database.delete(rateLimits).where(lt(rateLimits.windowStartedAt, sql`now() - interval '1 day'`)).returning({ key: rateLimits.key })
    const oldJobs = await database
      .delete(jobs)
      .where(and(sql`${jobs.status} in ('succeeded', 'failed', 'canceled')`, lt(jobs.completedAt, sql`now() - make_interval(days => ${JOB_RETENTION_DAYS})`)))
      .returning({ id: jobs.id })
    return { sessions: expiredSessions.length, idempotencyKeys: expiredKeys.length, events: oldEvents.length, rateLimits: staleLimits.length, jobs: oldJobs.length }
  },
}
