import { z } from "zod"
import { ENVIRONMENT_NAMES, IdSchema } from "./common"

export const ENV_SCOPES = ["all", ...ENVIRONMENT_NAMES] as const
export const EnvScopeSchema = z.enum(ENV_SCOPES)

const EnvKeySchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "Use uppercase letters, numbers, and underscores.").max(128)
const EnvValueSchema = z.string().max(32 * 1024)

/**
 * Browser-safe variable. A secret is write-only: once saved, reads report that a value
 * exists but never return it. Plain values are returned because the UI displays them.
 */
export const EnvVarDtoSchema = z.discriminatedUnion("secret", [
  z.strictObject({ id: IdSchema, key: EnvKeySchema, scope: EnvScopeSchema, secret: z.literal(true), hasValue: z.boolean() }),
  z.strictObject({ id: IdSchema, key: EnvKeySchema, scope: EnvScopeSchema, secret: z.literal(false), value: EnvValueSchema }),
])
export type EnvVarDTO = z.infer<typeof EnvVarDtoSchema>

/**
 * A create or update of one variable.
 * - No `id`: create. `value` is required.
 * - `id` with `value`: replace the stored value.
 * - `id` without `value`: keep the stored value and change only key, scope, or secret.
 * Deleting a variable is a separate operation, never an empty write.
 */
export const EnvVarWriteSchema = z
  .strictObject({
    id: IdSchema.optional(),
    key: EnvKeySchema,
    scope: EnvScopeSchema,
    secret: z.boolean(),
    value: EnvValueSchema.optional(),
  })
  .refine((write) => write.id !== undefined || write.value !== undefined, {
    message: "A new variable needs a value.",
    path: ["value"],
  })
export type EnvVarWrite = z.infer<typeof EnvVarWriteSchema>
