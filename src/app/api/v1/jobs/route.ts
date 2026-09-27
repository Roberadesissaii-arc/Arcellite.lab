import { CreateJobRequestSchema } from "@/lib/api/contracts/job"
import { sessionRoute } from "@/server/api/handler"
import { runIdempotent } from "@/server/services/idempotency"
import { createJob } from "@/server/services/jobs"

export const POST = sessionRoute(async (ctx) => {
  const input = await ctx.body(CreateJobRequestSchema)
  const key = ctx.idempotencyKey()
  const result = await runIdempotent(ctx.actor, "job.create", key, input, async (tx) => ({
    status: 202,
    body: await createJob(tx, ctx.actor, input, key),
  }))
  return { status: result.status, body: result.body, headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined }
})
