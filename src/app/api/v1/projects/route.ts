import { ProjectCreateRequestSchema } from "@/lib/api/contracts/project"
import { sessionRoute } from "@/server/api/handler"
import { runIdempotent } from "@/server/services/idempotency"
import { createProject, listProjects } from "@/server/services/projects"

export const GET = sessionRoute(async ({ actor }) => ({ body: await listProjects(actor) }))

export const POST = sessionRoute(async (ctx) => {
  const input = await ctx.body(ProjectCreateRequestSchema)
  const result = await runIdempotent(ctx.actor, "project.create", ctx.idempotencyKey(), input, async (tx) => ({
    status: 201,
    body: await createProject(tx, ctx.actor, input),
  }))
  return { status: result.status, body: result.body, headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined }
})
