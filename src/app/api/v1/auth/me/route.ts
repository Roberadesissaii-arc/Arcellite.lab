import { sessionRoute } from "@/server/api/handler"
import { describeSession } from "@/server/services/auth"

export const GET = sessionRoute(async ({ session }) => ({ body: describeSession(session) }))
