import { z } from "zod"
import { IdSchema, TimestampSchema } from "./common"

export const EVENT_TYPES = [
  "project.created",
  "project.updated",
  "project.archived",
  "environment.updated",
  "environment.deleted",
  "settings.updated",
  "job.queued",
  "job.started",
  "job.completed",
  "job.failed",
] as const
export const EventTypeSchema = z.enum(EVENT_TYPES)
export type EventType = z.infer<typeof EventTypeSchema>

/** One change-feed entry. `seq` is the SSE id; payloads carry identifiers, never secrets. */
export const EventDtoSchema = z.strictObject({
  seq: z.number().int().positive(),
  id: IdSchema,
  type: EventTypeSchema,
  objectType: z.string(),
  objectId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: TimestampSchema,
})
export type EventDTO = z.infer<typeof EventDtoSchema>
