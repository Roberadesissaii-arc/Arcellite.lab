import { ProjectUpdateRequestSchema } from "@/lib/api/contracts/project"
import { sessionRoute } from "@/server/api/handler"
import { requireId } from "@/server/api/ids"
import { archiveProject, getProject, updateProject } from "@/server/services/projects"

type Params = { projectId: string }

export const GET = sessionRoute<Params>(async ({ actor, params }) => ({ body: await getProject(actor, requireId(params.projectId, "That project")) }))

export const PATCH = sessionRoute<Params>(async (ctx) => {
  const projectId = requireId(ctx.params.projectId, "That project")
  return { body: await updateProject(ctx.actor, projectId, await ctx.body(ProjectUpdateRequestSchema)) }
})

export const DELETE = sessionRoute<Params>(async ({ actor, params }) => {
  await archiveProject(actor, requireId(params.projectId, "That project"))
  return { status: 204 }
})
