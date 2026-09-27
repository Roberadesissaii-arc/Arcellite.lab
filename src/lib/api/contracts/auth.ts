import { z } from "zod"
import { IdSchema } from "./common"

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 256

/** Length is the only composition rule: long passphrases beat symbol requirements. */
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)

/** An email address or a username. */
export const LoginIdentitySchema = z
  .string()
  .trim()
  .min(3, "Enter an email address or username.")
  .max(254)
  .regex(/^[^\s]+$/, "No spaces.")

export const BootstrapRequestSchema = z
  .strictObject({
    displayName: z.string().trim().min(1, "Enter your name.").max(80),
    login: LoginIdentitySchema,
    password: PasswordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((body) => body.password === body.passwordConfirmation, {
    message: "The passwords do not match.",
    path: ["passwordConfirmation"],
  })
export type BootstrapRequest = z.infer<typeof BootstrapRequestSchema>

export const LoginRequestSchema = z.strictObject({
  login: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "developer", "viewer"])
export const CapabilitySchema = z.enum([
  "read_project",
  "manage_project",
  "deploy_project",
  "edit_environment",
  "view_secret",
  "manage_server",
  "manage_domain",
  "manage_workspace",
  "read_audit",
])
export type Capability = z.infer<typeof CapabilitySchema>

export const AuthMeDtoSchema = z.strictObject({
  user: z.strictObject({ id: IdSchema, login: z.string(), displayName: z.string() }),
  workspace: z.strictObject({ id: IdSchema, name: z.string(), slug: z.string() }),
  role: WorkspaceRoleSchema,
  capabilities: z.array(CapabilitySchema),
})
export type AuthMeDTO = z.infer<typeof AuthMeDtoSchema>

export const AuthStatusDtoSchema = z.strictObject({
  setupRequired: z.boolean(),
  authenticated: z.boolean(),
})
export type AuthStatusDTO = z.infer<typeof AuthStatusDtoSchema>

/** Revealing a stored secret requires the current password, every time. */
export const RevealSecretRequestSchema = z.strictObject({ password: z.string().min(1).max(PASSWORD_MAX) })
export const RevealSecretResponseSchema = z.strictObject({ id: IdSchema, key: z.string(), value: z.string() })
export type RevealSecretResponse = z.infer<typeof RevealSecretResponseSchema>
