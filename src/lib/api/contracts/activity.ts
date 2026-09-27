import { z } from "zod"
import { ActivityResultSchema, IdSchema, TimestampSchema } from "./common"

/**
 * Human-readable operational history. Mirrors today's UI fields; the server version will
 * add `actorId`, `actorKind`, and `objectId` and derive `href` on the client.
 */
export const ActivityDtoSchema = z.strictObject({
  id: IdSchema,
  action: z.string().min(1),
  result: ActivityResultSchema,
  objectType: z.string().min(1),
  objectName: z.string(),
  href: z.string().nullable(),
  actor: z.string(),
  timestamp: TimestampSchema,
  detail: z.string().nullable(),
})
export type ActivityDTO = z.infer<typeof ActivityDtoSchema>
