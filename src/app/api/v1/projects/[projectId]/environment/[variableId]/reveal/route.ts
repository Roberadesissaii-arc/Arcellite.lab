import { RevealSecretRequestSchema } from "@/lib/api/contracts/auth"
import { sessionRoute } from "@/server/api/handler"
import { requireId } from "@/server/api/ids"
import { revealVariable } from "@/server/services/environment"

type Params = { projectId: string; variableId: string }

/** POST so the password travels in the body and the CSRF check applies. The value is never cached. */
export const POST = sessionRoute<Params>(async (ctx) => {
  const projectId = requireId(ctx.params.projectId, "That project")
  const variableId = requireId(ctx.params.variableId, "That variable")
  const { password } = await ctx.body(RevealSecretRequestSchema)
  return {
    body: await revealVariable(ctx.actor, projectId, variableId, password),
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  }
})
