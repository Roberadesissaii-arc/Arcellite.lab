import { EnvVarCreateSchema } from "@/lib/api/contracts/environment"
import { sessionRoute } from "@/server/api/handler"
import { requireId } from "@/server/api/ids"
import { createVariable, getVariable, listEnvironment } from "@/server/services/environment"
import { runIdempotent } from "@/server/services/idempotency"

type Params = { projectId: string }

export const GET = sessionRoute<Params>(async ({ actor, params }) => ({ body: await listEnvironment(actor, requireId(params.projectId, "That project")) }))

export const POST = sessionRoute<Params>(async (ctx) => {
  const projectId = requireId(ctx.params.projectId, "That project")
  const input = await ctx.body(EnvVarCreateSchema)
  // Only the new variable's ID is stored for replay; values never enter the idempotency table.
  const result = await runIdempotent(ctx.actor, `environment.create:${projectId}`, ctx.idempotencyKey(), input, async (tx) => ({
    status: 201,
    body: { id: (await createVariable(tx, ctx.actor, projectId, input)).id },
  }))
  const variable = await getVariable(ctx.actor, projectId, result.body.id)
  return { status: result.status, body: variable, headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined }
})
