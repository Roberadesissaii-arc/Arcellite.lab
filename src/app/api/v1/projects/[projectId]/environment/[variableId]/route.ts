import { EnvVarPatchSchema } from "@/lib/api/contracts/environment"
import { sessionRoute } from "@/server/api/handler"
import { requireId } from "@/server/api/ids"
import { deleteVariable, updateVariable } from "@/server/services/environment"

type Params = { projectId: string; variableId: string }

export const PATCH = sessionRoute<Params>(async (ctx) => {
  const projectId = requireId(ctx.params.projectId, "That project")
  const variableId = requireId(ctx.params.variableId, "That variable")
  return { body: await updateVariable(ctx.actor, projectId, variableId, await ctx.body(EnvVarPatchSchema)) }
})

export const DELETE = sessionRoute<Params>(async ({ actor, params }) => {
  await deleteVariable(actor, requireId(params.projectId, "That project"), requireId(params.variableId, "That variable"))
  return { status: 204 }
})
