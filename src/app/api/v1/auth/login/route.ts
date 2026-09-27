import { LoginRequestSchema } from "@/lib/api/contracts/auth"
import { sessionCookies } from "@/server/api/cookies"
import { publicRoute } from "@/server/api/handler"
import { login } from "@/server/services/auth"

export const POST = publicRoute(async (ctx) => {
  const input = await ctx.body(LoginRequestSchema)
  const { session } = await login(input, ctx.requestId)
  return { body: { ok: true }, cookies: sessionCookies(session.token, session.csrfToken, session.maxAgeSeconds) }
})
