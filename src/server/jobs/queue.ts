import "server-only"
import { and, eq, sql } from "drizzle-orm"
import type { JobDTO } from "@/lib/api/contracts/job"
import type { Executor } from "@/server/db/client"
import { jobAttempts, jobs } from "@/server/db/schema"
import { publishEvent } from "@/server/events/publish"

export const JOBS_CHANNEL = "arcellite_jobs"
/** How long a claim is valid without a heartbeat before another worker may take the job. */
export const LEASE_SECONDS = 60

export type JobRow = typeof jobs.$inferSelect

export interface EnqueueInput {
  workspaceId: string | null
  type: string
  payload?: Record<string, unknown>
  maxAttempts?: number
  timeoutSeconds?: number
  createdBy?: string | null
  requestId?: string | null
  idempotencyKey?: string | null
  runAfter?: Date
}

export function toJobDTO(row: JobRow): JobDTO {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    result: row.result ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

/** Queues a job durably. Workers are woken by NOTIFY once the enclosing transaction commits. */
export async function enqueueJob(executor: Executor, input: EnqueueInput): Promise<JobRow> {
  const [row] = await executor
    .insert(jobs)
    .values({
      workspaceId: input.workspaceId,
      type: input.type,
      payload: input.payload ?? {},
      maxAttempts: input.maxAttempts ?? 3,
      timeoutSeconds: input.timeoutSeconds ?? 300,
      createdBy: input.createdBy ?? null,
      requestId: input.requestId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      ...(input.runAfter ? { runAfter: input.runAfter } : {}),
    })
    .returning()
  if (row.workspaceId) await publishEvent(executor, { workspaceId: row.workspaceId, type: "job.queued", objectType: "job", objectId: row.id, payload: { jobType: row.type } })
  await executor.execute(sql`select pg_notify(${JOBS_CHANNEL}, ${row.id})`)
  return row
}

/**
 * Claims the next runnable job for `workerId`, or returns null. FOR UPDATE SKIP LOCKED means
 * concurrent workers never pick the same row; a running job whose lease expired (its worker
 * died) is runnable again. Canceled-before-start jobs are closed here instead of run.
 */
export async function claimJob(executor: Executor, workerId: string): Promise<JobRow | null> {
  const result = await executor.execute<{ id: string }>(sql`
    update jobs set
      status = 'running',
      locked_by = ${workerId},
      locked_at = now(),
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      attempts = attempts + 1,
      updated_at = now()
    where id = (
      select id from jobs
      where (status = 'queued' and run_after <= now())
         or (status = 'running' and lease_expires_at < now())
      order by run_after, created_at
      for update skip locked
      limit 1
    )
    returning id
  `)
  const id = result.rows[0]?.id
  if (!id) return null
  const [row] = await executor.select().from(jobs).where(eq(jobs.id, id))
  await executor.insert(jobAttempts).values({ jobId: row.id, attempt: row.attempts, workerId })
  return row
}

/** Extends the lease while the worker is still busy with the job. */
export async function heartbeat(executor: Executor, jobId: string, workerId: string): Promise<boolean> {
  const result = await executor
    .update(jobs)
    .set({ leaseExpiresAt: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, updatedAt: sql`now()` })
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, "running")))
    .returning({ id: jobs.id })
  return result.length > 0
}

async function closeAttempt(executor: Executor, row: JobRow, outcome: string, errorCode: string | null, errorMessage: string | null) {
  await executor
    .update(jobAttempts)
    .set({ finishedAt: sql`now()`, outcome, errorCode, errorMessage })
    .where(and(eq(jobAttempts.jobId, row.id), eq(jobAttempts.attempt, row.attempts)))
}

export async function completeJob(executor: Executor, row: JobRow, workerId: string, result: Record<string, unknown>): Promise<void> {
  const updated = await executor
    .update(jobs)
    .set({ status: "succeeded", result, completedAt: sql`now()`, updatedAt: sql`now()`, lockedBy: null, leaseExpiresAt: null })
    .where(and(eq(jobs.id, row.id), eq(jobs.lockedBy, workerId)))
    .returning({ id: jobs.id })
  if (!updated.length) return
  await closeAttempt(executor, row, "succeeded", null, null)
  if (row.workspaceId) await publishEvent(executor, { workspaceId: row.workspaceId, type: "job.completed", objectType: "job", objectId: row.id, payload: { jobType: row.type } })
}

/** Retries with exponential backoff until max_attempts, then fails for good. */
export async function failJob(executor: Executor, row: JobRow, workerId: string, errorCode: string, errorMessage: string): Promise<"retry" | "failed"> {
  const final = row.attempts >= row.maxAttempts
  const backoffSeconds = Math.min(300, 5 * 2 ** Math.max(0, row.attempts - 1))
  const updated = await executor
    .update(jobs)
    .set(
      final
        ? { status: "failed", errorCode, errorMessage, completedAt: sql`now()`, updatedAt: sql`now()`, lockedBy: null, leaseExpiresAt: null }
        : { status: "queued", errorCode, errorMessage, runAfter: sql`now() + make_interval(secs => ${backoffSeconds})`, updatedAt: sql`now()`, lockedBy: null, leaseExpiresAt: null },
    )
    .where(and(eq(jobs.id, row.id), eq(jobs.lockedBy, workerId)))
    .returning({ id: jobs.id })
  if (!updated.length) return final ? "failed" : "retry"
  await closeAttempt(executor, row, final ? "failed" : "retry", errorCode, errorMessage)
  if (final && row.workspaceId) await publishEvent(executor, { workspaceId: row.workspaceId, type: "job.failed", objectType: "job", objectId: row.id, payload: { jobType: row.type, errorCode } })
  return final ? "failed" : "retry"
}

export async function markCanceled(executor: Executor, row: JobRow, workerId: string): Promise<void> {
  await executor
    .update(jobs)
    .set({ status: "canceled", completedAt: sql`now()`, updatedAt: sql`now()`, lockedBy: null, leaseExpiresAt: null })
    .where(and(eq(jobs.id, row.id), eq(jobs.lockedBy, workerId)))
  await closeAttempt(executor, row, "canceled", null, null)
}

export async function announceStarted(executor: Executor, row: JobRow): Promise<void> {
  if (row.workspaceId) await publishEvent(executor, { workspaceId: row.workspaceId, type: "job.started", objectType: "job", objectId: row.id, payload: { jobType: row.type, attempt: row.attempts } })
}
