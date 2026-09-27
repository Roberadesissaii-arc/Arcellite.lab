import { z } from "zod"
import {
  EnvironmentNameSchema,
  FrameworkSchema,
  IdSchema,
  PortModeSchema,
  PortSchema,
  RestartPolicySchema,
  TimestampSchema,
} from "./common"

/** Where a project's code comes from. Identity only: credentials never belong here. */
export const ProjectSourceDtoSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("github"), owner: z.string().min(1), repo: z.string().min(1), fullName: z.string().min(1) }),
  z.strictObject({ type: z.literal("upload"), filename: z.string().min(1), size: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("git"), url: z.string().min(1) }),
  z.strictObject({ type: z.literal("image"), image: z.string().min(1) }),
  z.strictObject({ type: z.literal("compose"), filename: z.string().min(1) }),
  z.strictObject({ type: z.literal("dockerfile"), filename: z.string().min(1) }),
])
export type ProjectSourceDTO = z.infer<typeof ProjectSourceDtoSchema>

/**
 * Observed runtime of the project's active release. `not-deployed` means nothing has
 * been released yet, so a new project is never reported as running.
 */
export const ProjectRuntimeStateSchema = z.enum(["running", "stopped", "not-deployed"])

/**
 * Browser-safe project. Environment values are a separate resource (EnvVarDTO) and
 * mock-only controls such as failure simulation are not part of the contract.
 */
export const ProjectDtoSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1).max(64),
  slug: z.string().min(1).max(64),
  environment: EnvironmentNameSchema,
  framework: FrameworkSchema,
  source: ProjectSourceDtoSchema,
  branch: z.string().nullable(),
  rootDirectory: z.string().min(1),
  packageManager: z.string().nullable(),
  installCommand: z.string(),
  buildCommand: z.string(),
  startCommand: z.string(),
  outputDirectory: z.string().nullable(),
  internalPort: PortSchema,
  exposedPort: PortSchema,
  portMode: PortModeSchema,
  healthPath: z.string().min(1),
  restartPolicy: RestartPolicySchema,
  cpuLimit: z.number().positive().nullable(),
  memoryLimitMb: z.number().int().positive().nullable(),
  autoDeploy: z.boolean(),
  runtimeState: ProjectRuntimeStateSchema,
  activeDeploymentId: IdSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type ProjectDTO = z.infer<typeof ProjectDtoSchema>
