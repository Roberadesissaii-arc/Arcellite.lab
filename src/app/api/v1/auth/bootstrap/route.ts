import { BootstrapRequestSchema } from "@/lib/api/contracts/auth"
import { sessionCookies } from "@/server/api/cookies"
import { publicRoute } from "@/server/api/handler"
import { bootstrapOwner } from "@/server/services/auth"

export const POST = publicRoute(async (ctx) => {
  const input = await ctx.body(BootstrapRequestSchema)
  const { session } = await bootstrapOwner(input, ctx.requestId)
  return { status: 201, body: { ok: true }, cookies: sessionCookies(session.token, session.csrfToken, session.maxAgeSeconds) }
})
