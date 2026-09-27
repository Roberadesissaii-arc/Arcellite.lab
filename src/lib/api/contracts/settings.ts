import { z } from "zod"
import { EnvironmentNameSchema } from "./common"

/**
 * Settings as the browser sees them: workspace fields and the signed-in person's
 * preferences in one shape. Theme, motion, and sidebar stay in the browser.
 */
export const SettingsDtoSchema = z.strictObject({
  workspaceName: z.string().min(1).max(80),
  displayName: z.string().min(1).max(80),
  timezone: z.string().min(1).max(64),
  defaultBranch: z.string().min(1).max(255),
  defaultEnvironment: EnvironmentNameSchema,
  portAllocation: z.enum(["auto", "manual"]),
  portStart: z.number().int().min(1024).max(65535),
  buildConcurrency: z.number().int().min(1).max(8),
  logRetentionDays: z.number().int().min(1).max(365),
  autoRollback: z.boolean(),
  /** Always on for the real control plane; reported so the UI can show it. */
  redactSecrets: z.literal(true),
  notifyDeploySuccess: z.boolean(),
  notifyDeployFailure: z.boolean(),
  notifyDomains: z.boolean(),
  notifyServer: z.boolean(),
})
export type SettingsDTO = z.infer<typeof SettingsDtoSchema>

export const WORKSPACE_SETTING_KEYS = [
  "workspaceName",
  "defaultBranch",
  "defaultEnvironment",
  "portAllocation",
  "portStart",
  "buildConcurrency",
  "logRetentionDays",
  "autoRollback",
] as const

export const SettingsPatchSchema = SettingsDtoSchema.omit({ redactSecrets: true }).partial().strict()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>
