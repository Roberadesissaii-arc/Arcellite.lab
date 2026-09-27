import { z } from "zod"
import { CursorSchema, IdSchema, LogLevelSchema, LogTargetSchema, TimestampSchema } from "./common"

export const LogCategorySchema = z.enum(["build", "runtime", "system"])

/**
 * One log line. `sequence` orders lines from one source and lets a reconnecting tail
 * resume; `redacted` reports that secret masking was applied before the line left the source.
 */
export const LogEntryDtoSchema = z.strictObject({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative().optional(),
  timestamp: TimestampSchema,
  level: LogLevelSchema,
  category: LogCategorySchema,
  target: z.strictObject({ type: LogTargetSchema, id: IdSchema }),
  projectId: IdSchema.nullable(),
  deploymentId: IdSchema.nullable(),
  containerId: IdSchema.nullable(),
  message: z.string(),
  redacted: z.boolean(),
})
export type LogEntryDTO = z.infer<typeof LogEntryDtoSchema>

/** Log query. Cursor, limit, window, and category are accepted now so a real stream can page later. */
export const LogQuerySchema = z.strictObject({
  target: z.enum(["all", ...LogTargetSchema.options]),
  id: IdSchema.optional(),
  level: z.enum(["all", ...LogLevelSchema.options]).optional(),
  search: z.string().max(200).optional(),
  cursor: CursorSchema.optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  since: TimestampSchema.optional(),
  until: TimestampSchema.optional(),
  category: LogCategorySchema.optional(),
})
export type LogQueryDTO = z.infer<typeof LogQuerySchema>
