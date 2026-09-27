import "server-only"
import { and, eq } from "drizzle-orm"
import type { CreateJobRequest, JobDTO } from "@/lib/api/contracts/job"
import { notFound } from "@/server/api/failure"
import { writeAudit } from "@/server/audit/audit"
import { requireCapability, type Actor } from "@/server/auth/authorize"
import { db, type Tx } from "@/server/db/client"
import { jobs } from "@/server/db/schema"
import { enqueueJob, toJobDTO } from "@/server/jobs/queue"

export async function createJob(tx: Tx, actor: Actor, input: CreateJobRequest, idempotencyKey: string | null): Promise<JobDTO> {
  await requireCapability(actor, "manage_workspace")
  const row = await enqueueJob(tx, {
    workspaceId: actor.workspaceId,
    type: input.type,
    payload: input.payload ?? {},
    createdBy: actor.userId,
    requestId: actor.requestId,
    idempotencyKey,
  })
  await writeAudit(tx, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "job.create", outcome: "success", objectType: "job", objectId: row.id, requestId: actor.requestId, metadata: { type: input.type } })
  return toJobDTO(row)
}

export async function getJob(actor: Actor, jobId: string): Promise<JobDTO> {
  await requireCapability(actor, "read_project")
  const [row] = await db().select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, actor.workspaceId))).limit(1)
  if (!row) throw notFound("That job")
  return toJobDTO(row)
}
