import { readCookie, SESSION_COOKIE } from "@/server/api/cookies"
import { publicRoute } from "@/server/api/handler"
import { resolveSession } from "@/server/auth/session"
import { db } from "@/server/db/client"
import { isSetupRequired } from "@/server/services/auth"

export const GET = publicRoute(async ({ request }) => {
  const session = await resolveSession(db(), readCookie(request.headers.get("cookie"), SESSION_COOKIE))
  return { body: { setupRequired: await isSetupRequired(), authenticated: session !== null } }
})
