import { sessionRoute } from "@/server/api/handler"
import { requireId } from "@/server/api/ids"
import { getJob } from "@/server/services/jobs"

export const GET = sessionRoute<{ jobId: string }>(async ({ actor, params }) => ({ body: await getJob(actor, requireId(params.jobId, "That job")) }))
