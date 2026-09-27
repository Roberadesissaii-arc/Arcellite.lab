import "server-only"
import type { Capability } from "@/lib/api/contracts/auth"
import { ApiFailure } from "@/server/api/failure"
import { writeAudit } from "@/server/audit/audit"
import { db } from "@/server/db/client"
import type { WorkspaceRole } from "@/server/db/schema"

/** Who is acting, in which workspace, for which request. Every service call takes one. */
export interface Actor {
  userId: string
  displayName: string
  workspaceId: string
  role: WorkspaceRole
  requestId: string
  sessionId: string
}

const ALL: Capability[] = [
  "read_project",
  "manage_project",
  "deploy_project",
  "edit_environment",
  "view_secret",
  "manage_server",
  "manage_domain",
  "manage_workspace",
  "read_audit",
]

/** The single place roles turn into permissions. */
const ROLE_CAPABILITIES: Record<WorkspaceRole, readonly Capability[]> = {
  owner: ALL,
  admin: ALL.filter((capability) => capability !== "manage_workspace"),
  developer: ["read_project", "manage_project", "deploy_project", "edit_environment", "manage_domain"],
  viewer: ["read_project"],
}

export function capabilitiesFor(role: WorkspaceRole): Capability[] {
  return [...ROLE_CAPABILITIES[role]]
}

export function can(actor: Pick<Actor, "role">, capability: Capability): boolean {
  return ROLE_CAPABILITIES[actor.role].includes(capability)
}

/** Throws FORBIDDEN (and records the denial) unless the actor holds the capability. */
export async function requireCapability(actor: Actor, capability: Capability): Promise<void> {
  if (can(actor, capability)) return
  await writeAudit(db(), {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "authorization.denied",
    outcome: "denied",
    requestId: actor.requestId,
    metadata: { capability, role: actor.role },
  })
  throw new ApiFailure("FORBIDDEN", "You do not have permission to do that.")
}
