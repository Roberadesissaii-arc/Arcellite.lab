import { z } from "zod"
import { IdSchema, TimestampSchema } from "./common"

/** A security audit record. Read-only over the API. */
export const AuditEntryDtoSchema = z.strictObject({
  id: IdSchema,
  action: z.string(),
  outcome: z.enum(["success", "failure", "denied"]),
  actorKind: z.enum(["user", "system", "anonymous"]),
  actorUserId: IdSchema.nullable(),
  objectType: z.string().nullable(),
  objectId: z.string().nullable(),
  requestId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: TimestampSchema,
})
export type AuditEntryDTO = z.infer<typeof AuditEntryDtoSchema>
