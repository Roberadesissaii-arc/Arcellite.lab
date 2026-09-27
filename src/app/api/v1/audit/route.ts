import { sessionRoute } from "@/server/api/handler"
import { listAudit } from "@/server/services/audit"

export const GET = sessionRoute(async ({ actor }) => ({ body: await listAudit(actor) }))
