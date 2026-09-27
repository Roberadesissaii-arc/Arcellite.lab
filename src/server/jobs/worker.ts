import "server-only"
import { and, eq, gt, inArray, or, sql } from "drizzle-orm"
import { db } from "@/server/db/client"
import { jobs } from "@/server/db/schema"
import { log } from "@/server/security/log"
import { HOUSEKEEPING_JOB, JOB_HANDLERS, type JobHandler } from "./handlers"
import { announceStarted, claimJob, completeJob, enqueueJob, failJob, heartbeat, LEASE_SECONDS, markCanceled, type JobRow } from "./queue"

export class JobTimeoutError extends Error {
  constructor() {
    super("The job exceeded its timeout.")
    this.name = "JobTimeoutError"
  }
}

export type RunOutcome = "idle" | "succeeded" | "retry" | "failed" | "canceled"

/**
 * Claims and runs at most one job. The claim, the start event, and every terminal state
 * change are separate short transactions; the handler itself runs outside any transaction
 * while a heartbeat keeps the lease alive.
 */
export async function runOnce(workerId: string, handlers: Record<string, JobHandler> = JOB_HANDLERS): Promise<{ outcome: RunOutcome; job: JobRow | null }> {
  const job = await db().transaction(async (tx) => {
    const claimed = await claimJob(tx, workerId)
    if (claimed && !claimed.cancellationRequestedAt && claimed.attempts <= claimed.maxAttempts) await announceStarted(tx, claimed)
    return claimed
  })
  if (!job) return { outcome: "idle", job: null }

  if (job.cancellationRequestedAt) {
    await db().transaction((tx) => markCanceled(tx, job, workerId))
    return { outcome: "canceled", job }
  }
  // A lease that expired on the final attempt means the worker died holding it.
  if (job.attempts > job.maxAttempts) {
    await db().transaction((tx) => failJob(tx, job, workerId, "LEASE_EXPIRED", "The worker stopped before the job finished."))
    return { outcome: "failed", job }
  }
  const handler = handlers[job.type]
  if (!handler) {
    await db().transaction((tx) => failJob(tx, { ...job, attempts: job.maxAttempts }, workerId, "UNKNOWN_JOB_TYPE", "This worker has no handler for the job type."))
    return { outcome: "failed", job }
  }

  const controller = new AbortController()
  const beat = setInterval(() => void heartbeat(db(), job.id, workerId).catch(() => {}), (LEASE_SECONDS * 1000) / 3)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      handler({ payload: job.payload, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new JobTimeoutError())
        }, job.timeoutSeconds * 1000)
      }),
    ])
    await db().transaction((tx) => completeJob(tx, job, workerId, result))
    return { outcome: "succeeded", job }
  } catch (error) {
    const code = error instanceof JobTimeoutError ? "TIMEOUT" : "HANDLER_FAILED"
    // Error messages from handlers are not shown verbatim: they may carry internals.
    const message = error instanceof JobTimeoutError ? error.message : "The job handler failed."
    log("warn", "job.failed", { jobId: job.id, type: job.type, attempt: job.attempts, code, error: error instanceof Error ? error.name : typeof error })
    const outcome = await db().transaction((tx) => failJob(tx, job, workerId, code, message))
    return { outcome, job }
  } finally {
    clearInterval(beat)
    clearTimeout(timeout)
  }
}

/** Queues housekeeping unless one is pending or ran within the interval. Safe across workers. */
export async function scheduleHousekeeping(intervalSeconds: number): Promise<boolean> {
  return db().transaction(async (tx) => {
    const locked = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('arcellite:housekeeping')) as locked`)
    if (!locked.rows[0]?.locked) return false
    const [recent] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.type, HOUSEKEEPING_JOB), or(inArray(jobs.status, ["queued", "running"]), gt(jobs.createdAt, sql`now() - make_interval(secs => ${intervalSeconds})`))))
      .limit(1)
    if (recent) return false
    await enqueueJob(tx, { workspaceId: null, type: HOUSEKEEPING_JOB, maxAttempts: 3, timeoutSeconds: 120 })
    return true
  })
}
