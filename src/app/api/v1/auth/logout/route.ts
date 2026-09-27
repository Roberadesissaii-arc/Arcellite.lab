import { clearedSessionCookies } from "@/server/api/cookies"
import { sessionRoute } from "@/server/api/handler"
import { logout } from "@/server/services/auth"

export const POST = sessionRoute(async ({ session, requestId }) => {
  await logout(session, requestId)
  return { status: 204, cookies: clearedSessionCookies() }
})
