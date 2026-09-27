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
import { EnvVarCreateSchema } from "./environment"

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

const SafeRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !value.startsWith("/") && !value.split("/").includes("..") && !value.includes("\0"), "Use a path inside the project.")

const CommandSchema = z.string().max(2048).refine((value) => !/[\0\r\n]/.test(value), "Commands must be a single line.")

/**
 * Source identity accepted from the browser. Syntax only: nothing is fetched yet.
 * Git URLs must be https (no file://, no embedded credentials).
 */
export const ProjectSourceInputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("github"),
    owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/),
    repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    fullName: z.string().max(140),
  }),
  z.strictObject({
    type: z.literal("upload"),
    filename: z.string().trim().min(1).max(255).refine((value) => !/[\\/\0]/.test(value), "A file name, not a path."),
    size: z.number().int().nonnegative().max(1024 * 1024 * 1024),
  }),
  z.strictObject({
    type: z.literal("git"),
    url: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value)
          return url.protocol === "https:" && !url.username && !url.password && Boolean(url.hostname)
        } catch {
          return false
        }
      }, "Use an https:// repository URL without credentials."),
  }),
  z.strictObject({
    type: z.literal("image"),
    image: z
      .string()
      .trim()
      .max(512)
      .regex(/^[a-z0-9]+([._-][a-z0-9]+)*(:[0-9]+)?(\/[a-z0-9]+([._-][a-z0-9]+)*)*(:[A-Za-z0-9_][A-Za-z0-9._-]{0,127})?(@sha256:[a-f0-9]{64})?$/, "Use an image reference such as nginx:1.27-alpine."),
  }),
  z.strictObject({ type: z.literal("compose"), filename: SafeRelativePathSchema }),
  z.strictObject({ type: z.literal("dockerfile"), filename: SafeRelativePathSchema }),
])
export type ProjectSourceInput = z.infer<typeof ProjectSourceInputSchema>

const projectConfigFields = {
  name: z.string().trim().min(1, "Name the project.").max(64),
  environment: EnvironmentNameSchema,
  framework: FrameworkSchema,
  branch: z.string().trim().min(1).max(255).regex(/^[^\s~^:?*[\\]+$/, "Not a valid branch name.").nullable(),
  rootDirectory: SafeRelativePathSchema,
  packageManager: z.string().max(32).nullable(),
  installCommand: CommandSchema,
  buildCommand: CommandSchema,
  startCommand: CommandSchema,
  outputDirectory: SafeRelativePathSchema.nullable(),
  internalPort: PortSchema,
  exposedPort: PortSchema,
  portMode: PortModeSchema,
  healthPath: z.string().trim().min(1).max(512).regex(/^\/[^\s]*$/, "Start the health path with /."),
  restartPolicy: RestartPolicySchema,
  cpuLimit: z.number().min(0.1).max(256).nullable(),
  memoryLimitMb: z.number().int().min(64).max(1024 * 1024).nullable(),
  autoDeploy: z.boolean(),
}

/**
 * Create a project, optionally with its first environment variables in the same
 * transaction. Later variable changes go through the environment resource.
 */
export const ProjectCreateRequestSchema = z.strictObject({
  ...projectConfigFields,
  source: ProjectSourceInputSchema,
  env: z.array(EnvVarCreateSchema).max(200).optional(),
})
export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequestSchema>

export const ProjectUpdateRequestSchema = z.strictObject(projectConfigFields).partial()
export type ProjectUpdateRequest = z.infer<typeof ProjectUpdateRequestSchema>
