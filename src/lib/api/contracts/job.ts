import { z } from "zod"
import { IdSchema, TimestampSchema } from "./common"

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "canceled"] as const

/** Job types a browser may enqueue. Housekeeping is scheduled by the worker itself. */
export const CLIENT_JOB_TYPES = ["control-plane.noop"] as const

export const JobDtoSchema = z.strictObject({
  id: IdSchema,
  type: z.string(),
  status: z.enum(JOB_STATUSES),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  result: z.record(z.string(), z.unknown()).nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
})
export type JobDTO = z.infer<typeof JobDtoSchema>

export const CreateJobRequestSchema = z.strictObject({
  type: z.enum(CLIENT_JOB_TYPES),
  payload: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
})
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>
