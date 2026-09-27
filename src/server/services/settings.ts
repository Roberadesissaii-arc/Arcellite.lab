import "server-only"
import { eq, sql } from "drizzle-orm"
import { WORKSPACE_SETTING_KEYS, type SettingsDTO, type SettingsPatch } from "@/lib/api/contracts/settings"
import { writeAudit } from "@/server/audit/audit"
import { requireCapability, type Actor } from "@/server/auth/authorize"
import { db, type Executor } from "@/server/db/client"
import { userPreferences, users, workspaces, workspaceSettings } from "@/server/db/schema"
import { publishEvent } from "@/server/events/publish"
import { recordActivity } from "./activity"

async function readSettings(executor: Executor, actor: Actor): Promise<SettingsDTO> {
  const [row] = await executor
    .select({ workspace: workspaces, settings: workspaceSettings, user: users, prefs: userPreferences })
    .from(workspaces)
    .innerJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))
    .innerJoin(users, eq(users.id, actor.userId))
    .innerJoin(userPreferences, eq(userPreferences.userId, actor.userId))
    .where(eq(workspaces.id, actor.workspaceId))
    .limit(1)
  return {
    workspaceName: row.workspace.name,
    displayName: row.user.displayName,
    timezone: row.prefs.timezone,
    defaultBranch: row.settings.defaultBranch,
    defaultEnvironment: row.settings.defaultEnvironment as SettingsDTO["defaultEnvironment"],
    portAllocation: row.settings.portAllocation as SettingsDTO["portAllocation"],
    portStart: row.settings.portStart,
    buildConcurrency: row.settings.buildConcurrency,
    logRetentionDays: row.settings.logRetentionDays,
    autoRollback: row.settings.autoRollback,
    redactSecrets: true,
    notifyDeploySuccess: row.prefs.notifyDeploySuccess,
    notifyDeployFailure: row.prefs.notifyDeployFailure,
    notifyDomains: row.prefs.notifyDomains,
    notifyServer: row.prefs.notifyServer,
  }
}

export function getSettings(actor: Actor): Promise<SettingsDTO> {
  return readSettings(db(), actor)
}

/** Workspace fields need manage_workspace; personal preferences belong to whoever is signed in. */
export async function updateSettings(actor: Actor, patch: SettingsPatch): Promise<SettingsDTO> {
  const fields = Object.keys(patch) as (keyof SettingsPatch)[]
  const workspaceFields = fields.filter((field) => (WORKSPACE_SETTING_KEYS as readonly string[]).includes(field))
  if (workspaceFields.length) await requireCapability(actor, "manage_workspace")
  return db().transaction(async (tx) => {
    if (patch.workspaceName !== undefined) await tx.update(workspaces).set({ name: patch.workspaceName, updatedAt: sql`now()` }).where(eq(workspaces.id, actor.workspaceId))
    const settings = {
      ...(patch.defaultBranch !== undefined ? { defaultBranch: patch.defaultBranch } : {}),
      ...(patch.defaultEnvironment !== undefined ? { defaultEnvironment: patch.defaultEnvironment } : {}),
      ...(patch.portAllocation !== undefined ? { portAllocation: patch.portAllocation } : {}),
      ...(patch.portStart !== undefined ? { portStart: patch.portStart } : {}),
      ...(patch.buildConcurrency !== undefined ? { buildConcurrency: patch.buildConcurrency } : {}),
      ...(patch.logRetentionDays !== undefined ? { logRetentionDays: patch.logRetentionDays } : {}),
      ...(patch.autoRollback !== undefined ? { autoRollback: patch.autoRollback } : {}),
    }
    if (Object.keys(settings).length) await tx.update(workspaceSettings).set({ ...settings, updatedAt: sql`now()` }).where(eq(workspaceSettings.workspaceId, actor.workspaceId))
    if (patch.displayName !== undefined) await tx.update(users).set({ displayName: patch.displayName, updatedAt: sql`now()` }).where(eq(users.id, actor.userId))
    const prefs = {
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.notifyDeploySuccess !== undefined ? { notifyDeploySuccess: patch.notifyDeploySuccess } : {}),
      ...(patch.notifyDeployFailure !== undefined ? { notifyDeployFailure: patch.notifyDeployFailure } : {}),
      ...(patch.notifyDomains !== undefined ? { notifyDomains: patch.notifyDomains } : {}),
      ...(patch.notifyServer !== undefined ? { notifyServer: patch.notifyServer } : {}),
    }
    if (Object.keys(prefs).length) await tx.update(userPreferences).set({ ...prefs, updatedAt: sql`now()` }).where(eq(userPreferences.userId, actor.userId))
    const displayName = patch.displayName ?? actor.displayName
    await recordActivity(tx, { ...actor, displayName }, { action: "Settings updated", result: "info", objectType: "Settings", objectName: fields.join(", "), href: "/settings" })
    await writeAudit(tx, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "settings.update", outcome: "success", objectType: "settings", objectId: actor.workspaceId, requestId: actor.requestId, metadata: { fields } })
    await publishEvent(tx, { workspaceId: actor.workspaceId, type: "settings.updated", objectType: "settings", objectId: actor.workspaceId, payload: { fields } })
    return readSettings(tx, { ...actor, displayName })
  })
}
