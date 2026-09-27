import "server-only"
import { desc, eq } from "drizzle-orm"
import type { ActivityDTO } from "@/lib/api/contracts/activity"
import type { Actor } from "@/server/auth/authorize"
import type { Executor } from "@/server/db/client"
import { activityEvents } from "@/server/db/schema"

export interface ActivityInput {
  action: string
  result: ActivityDTO["result"]
  objectType: string
  objectId?: string | null
  objectName: string
  href?: string | null
  detail?: string | null
}

/** Human-friendly history. Written in the same transaction as the change it describes. */
export async function recordActivity(executor: Executor, actor: Pick<Actor, "workspaceId" | "userId" | "displayName">, input: ActivityInput): Promise<void> {
  await executor.insert(activityEvents).values({
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    actorName: actor.displayName,
    action: input.action,
    result: input.result,
    objectType: input.objectType,
    objectId: input.objectId ?? null,
    objectName: input.objectName,
    href: input.href ?? null,
    detail: input.detail ?? null,
  })
}

export async function listActivity(executor: Executor, workspaceId: string, limit = 200): Promise<ActivityDTO[]> {
  const rows = await executor
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.workspaceId, workspaceId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500))
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    result: row.result as ActivityDTO["result"],
    objectType: row.objectType,
    objectName: row.objectName,
    href: row.href,
    actor: row.actorName,
    timestamp: row.createdAt.toISOString(),
    detail: row.detail,
  }))
}
