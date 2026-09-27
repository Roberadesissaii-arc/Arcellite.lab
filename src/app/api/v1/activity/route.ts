import { sessionRoute } from "@/server/api/handler"
import { requireCapability } from "@/server/auth/authorize"
import { db } from "@/server/db/client"
import { listActivity } from "@/server/services/activity"

export const GET = sessionRoute(async ({ actor }) => {
  await requireCapability(actor, "read_project")
  return { body: await listActivity(db(), actor.workspaceId) }
})
