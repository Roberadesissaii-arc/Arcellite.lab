import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/server/db/client"
import { events, idempotencyKeys, jobAttempts, jobs, sessions } from "@/server/db/schema"
import { HOUSEKEEPING_JOB, NOOP_JOB } from "@/server/jobs/handlers"
import { claimJob, enqueueJob } from "@/server/jobs/queue"
import { runOnce, scheduleHousekeeping } from "@/server/jobs/worker"
import { addMember, Browser, bootstrapOwner, json, resetDatabase, routes, type RouteHandler } from "./harness"

let owner: Browser
let workspaceId: string
beforeEach(async () => {
  await resetDatabase()
  owner = await bootstrapOwner()
  workspaceId = (await json<{ workspace: { id: string } }>(await owner.call(routes.me.GET as RouteHandler, "/api/v1/auth/me"))).workspace.id
})

describe("job queue", () => {
  it("28. lets exactly one of many concurrent workers claim a job", async () => {
    await enqueueJob(db(), { workspaceId, type: NOOP_JOB })
    const claims = await Promise.all(Array.from({ length: 8 }, (_, index) => db().transaction((tx) => claimJob(tx, `worker-${index}`))))
    const winners = claims.filter(Boolean)
    expect(winners).toHaveLength(1)
    const [row] = await db().select().from(jobs)
    expect(row).toMatchObject({ status: "running", attempts: 1, lockedBy: winners[0]!.lockedBy })
    expect(await db().select().from(jobAttempts)).toHaveLength(1)
  })

  it("claims many jobs across workers without overlap", async () => {
    for (let index = 0; index < 10; index += 1) await enqueueJob(db(), { workspaceId, type: NOOP_JOB })
    const results = await Promise.all(Array.from({ length: 4 }, async (_, worker) => {
      const mine: string[] = []
      for (;;) {
        const job = await db().transaction((tx) => claimJob(tx, `w${worker}`))
        if (!job) return mine
        mine.push(job.id)
      }
    }))
    const all = results.flat()
    expect(all).toHaveLength(10)
    expect(new Set(all).size).toBe(10)
  })

  it("runs a no-op job to success and publishes its lifecycle events", async () => {
    const job = await enqueueJob(db(), { workspaceId, type: NOOP_JOB })
    const run = await runOnce("worker-a")
    expect(run.outcome).toBe("succeeded")
    const [row] = await db().select().from(jobs).where(eq(jobs.id, job.id))
    expect(row).toMatchObject({ status: "succeeded", result: { ok: true }, lockedBy: null })
    expect(row.completedAt).not.toBeNull()
    const types = (await db().select().from(events).where(eq(events.objectId, job.id)).orderBy(events.seq)).map((event) => event.type)
    expect(types).toEqual(["job.queued", "job.started", "job.completed"])
    expect((await runOnce("worker-a")).outcome).toBe("idle")
  })

  it("retries with backoff, then fails for good at max attempts", async () => {
    const job = await enqueueJob(db(), { workspaceId, type: "test.flaky", maxAttempts: 2 })
    const failing = { "test.flaky": async () => { throw new Error("boom: /secret/path") } }
    expect((await runOnce("w", failing)).outcome).toBe("retry")
    let [row] = await db().select().from(jobs).where(eq(jobs.id, job.id))
    expect(row.status).toBe("queued")
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now())
    // The handler's own message is not stored: it may carry internals.
    expect(row.errorMessage).not.toContain("/secret/path")
    expect((await runOnce("w", failing)).outcome).toBe("idle")
    await db().update(jobs).set({ runAfter: sql`now()` })
    expect((await runOnce("w", failing)).outcome).toBe("failed")
    ;[row] = await db().select().from(jobs).where(eq(jobs.id, job.id))
    expect(row).toMatchObject({ status: "failed", attempts: 2, errorCode: "HANDLER_FAILED" })
    expect(await db().select().from(jobAttempts).where(eq(jobAttempts.jobId, job.id))).toHaveLength(2)
  })

  it("times out a handler", async () => {
    await enqueueJob(db(), { workspaceId, type: "test.slow", timeoutSeconds: 1, maxAttempts: 1 })
    const slow = { "test.slow": () => new Promise<Record<string, unknown>>(() => {}) }
    const run = await runOnce("w", slow)
    expect(run.outcome).toBe("failed")
    const [row] = await db().select().from(jobs)
    expect(row.errorCode).toBe("TIMEOUT")
  })

  it("reclaims a job whose worker died (lease expired) and fails it after the last attempt", async () => {
    const job = await enqueueJob(db(), { workspaceId, type: NOOP_JOB, maxAttempts: 2 })
    await db().transaction((tx) => claimJob(tx, "dead-worker"))
    expect((await runOnce("live-worker")).outcome).toBe("idle")
    await db().update(jobs).set({ leaseExpiresAt: sql`now() - interval '1 second'` })
    expect((await runOnce("live-worker")).outcome).toBe("succeeded")
    const [row] = await db().select().from(jobs).where(eq(jobs.id, job.id))
    expect(row).toMatchObject({ status: "succeeded", attempts: 2 })

    const doomed = await enqueueJob(db(), { workspaceId, type: NOOP_JOB, maxAttempts: 1 })
    await db().transaction((tx) => claimJob(tx, "dead-worker"))
    await db().update(jobs).set({ leaseExpiresAt: sql`now() - interval '1 second'` }).where(eq(jobs.id, doomed.id))
    expect((await runOnce("live-worker")).outcome).toBe("failed")
    const [failed] = await db().select().from(jobs).where(eq(jobs.id, doomed.id))
    expect(failed.errorCode).toBe("LEASE_EXPIRED")
  })

  it("keeps queued jobs across worker restarts (state lives only in PostgreSQL)", async () => {
    await enqueueJob(db(), { workspaceId, type: NOOP_JOB })
    // No worker ran. A new worker process sees the durable row.
    expect((await runOnce(`fresh-${Date.now()}`)).outcome).toBe("succeeded")
  })

  it("fails unknown job types without retrying", async () => {
    await enqueueJob(db(), { workspaceId, type: "docker.run", maxAttempts: 5 })
    expect((await runOnce("w")).outcome).toBe("failed")
    const [row] = await db().select().from(jobs)
    expect(row).toMatchObject({ status: "failed", errorCode: "UNKNOWN_JOB_TYPE", attempts: 1 })
  })

  it("closes a job whose cancellation was requested before it started", async () => {
    await enqueueJob(db(), { workspaceId, type: NOOP_JOB })
    await db().update(jobs).set({ cancellationRequestedAt: sql`now()` })
    expect((await runOnce("w")).outcome).toBe("canceled")
  })
})

describe("housekeeping", () => {
  it("is scheduled once per interval across workers", async () => {
    const scheduled = await Promise.all([scheduleHousekeeping(3600), scheduleHousekeeping(3600), scheduleHousekeeping(3600)])
    expect(scheduled.filter(Boolean)).toHaveLength(1)
    expect(await scheduleHousekeeping(3600)).toBe(false)
  })

  it("prunes expired sessions, idempotency keys, and old events", async () => {
    await db().update(sessions).set({ expiresAt: sql`now() - interval '2 days'` })
    await db().insert(idempotencyKeys).values({ workspaceId, operation: "x", key: "k", requestHash: "h", responseStatus: 200, responseBody: {}, expiresAt: sql`now() - interval '1 hour'` })
    await db().insert(events).values({ workspaceId, type: "project.updated", objectType: "project", createdAt: sql`now() - interval '60 days'` })
    await enqueueJob(db(), { workspaceId: null, type: HOUSEKEEPING_JOB })
    const run = await runOnce("w")
    expect(run.outcome).toBe("succeeded")
    const [row] = await db().select().from(jobs).where(eq(jobs.type, HOUSEKEEPING_JOB))
    expect(row.result).toMatchObject({ sessions: 1, idempotencyKeys: 1, events: 1 })
  })
})

describe("jobs API", () => {
  it("queues a no-op job idempotently and reads it back", async () => {
    const headers = { "idempotency-key": "job-1" }
    const first = await owner.call(routes.jobs.POST as RouteHandler, "/api/v1/jobs", { method: "POST", body: { type: NOOP_JOB }, headers })
    const second = await owner.call(routes.jobs.POST as RouteHandler, "/api/v1/jobs", { method: "POST", body: { type: NOOP_JOB }, headers })
    expect(first.status).toBe(202)
    const job = await json<{ id: string; status: string }>(first)
    expect((await json<{ id: string }>(second)).id).toBe(job.id)
    expect(await db().select().from(jobs)).toHaveLength(1)
    await runOnce("w")
    const read = await owner.call(routes.job.GET as RouteHandler, `/api/v1/jobs/${job.id}`, { params: { jobId: job.id } })
    expect(await json(read)).toMatchObject({ id: job.id, status: "succeeded" })
  })

  it("accepts only client job types and hides other workspaces' jobs", async () => {
    for (const type of [HOUSEKEEPING_JOB, "shell.exec", "docker.run"]) {
      const response = await owner.call(routes.jobs.POST as RouteHandler, "/api/v1/jobs", { method: "POST", body: { type } })
      expect(response.status, type).toBe(400)
    }
    const job = await enqueueJob(db(), { workspaceId, type: NOOP_JOB })
    const stranger = await addMember("owner", "x@example.com", { workspaceName: "Other" })
    expect((await stranger.call(routes.job.GET as RouteHandler, `/api/v1/jobs/${job.id}`, { params: { jobId: job.id } })).status).toBe(404)
  })
})
