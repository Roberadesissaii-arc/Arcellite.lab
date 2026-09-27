import "server-only"
import { sql } from "drizzle-orm"
import type { Executor } from "@/server/db/client"

export interface RateLimitPolicy {
  /** Attempts allowed per window. */
  limit: number
  windowSeconds: number
}

/** Five failed sign-ins per identity within 15 minutes locks that identity for the rest of the window. */
export const LOGIN_POLICY: RateLimitPolicy = { limit: 5, windowSeconds: 15 * 60 }
/** Ten secret reveals (right or wrong password) per person within 15 minutes. */
export const REVEAL_POLICY: RateLimitPolicy = { limit: 10, windowSeconds: 15 * 60 }

/**
 * Fixed-window counter in PostgreSQL, atomic across processes: one upsert increments the
 * count, or restarts the window when it has expired, and returns the new count.
 */
export async function recordAttempt(executor: Executor, key: string, policy: RateLimitPolicy): Promise<number> {
  const result = await executor.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_started_at, count, updated_at)
    values (${key}, now(), 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_started_at < now() - make_interval(secs => ${policy.windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_started_at = case when rate_limits.window_started_at < now() - make_interval(secs => ${policy.windowSeconds}) then now() else rate_limits.window_started_at end,
      updated_at = now()
    returning count
  `)
  return Number(result.rows[0]?.count ?? 0)
}

/** Attempts already recorded in the current window (0 when the window has expired). */
export async function attemptsInWindow(executor: Executor, key: string, policy: RateLimitPolicy): Promise<{ count: number; retryAfterSeconds: number }> {
  const result = await executor.execute<{ count: number; retry: number }>(sql`
    select count, greatest(0, ceil(extract(epoch from (window_started_at + make_interval(secs => ${policy.windowSeconds}) - now()))))::int as retry
    from rate_limits
    where key = ${key} and window_started_at >= now() - make_interval(secs => ${policy.windowSeconds})
  `)
  const row = result.rows[0]
  return row ? { count: Number(row.count), retryAfterSeconds: Number(row.retry) } : { count: 0, retryAfterSeconds: 0 }
}

export async function resetAttempts(executor: Executor, key: string): Promise<void> {
  await executor.execute(sql`delete from rate_limits where key = ${key}`)
}
