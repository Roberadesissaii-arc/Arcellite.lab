import { z } from "zod"
import {
  DeploymentPhaseSchema,
  DeploymentStatusSchema,
  EnvironmentNameSchema,
  IdSchema,
  StepStatusSchema,
  TimestampSchema,
} from "./common"
import { ApiErrorCodeSchema } from "./error"

/**
 * One pipeline step. `phase` is the step's identity; clients must key on it rather than
 * on array position, because real pipelines vary by source (an image skips the build).
 */
export const DeploymentStepDtoSchema = z.strictObject({
  phase: DeploymentPhaseSchema,
  label: z.string().min(1),
  status: StepStatusSchema,
  startedAt: TimestampSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
})
export type DeploymentStepDTO = z.infer<typeof DeploymentStepDtoSchema>

/**
 * Why a deployment did not publish, written for people. This is a property of the
 * deployment resource, not a transport error: the request that read it succeeded.
 */
export const DeploymentFailureDtoSchema = z.strictObject({
  code: ApiErrorCodeSchema.optional(),
  title: z.string().min(1),
  detail: z.string(),
  affects: z.string(),
  action: z.string(),
})
export type DeploymentFailureDTO = z.infer<typeof DeploymentFailureDtoSchema>

export const DeploymentTriggerDtoSchema = z.strictObject({
  kind: z.enum(["user", "webhook", "system"]),
  name: z.string().min(1),
})

export const DeploymentDtoSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  environment: EnvironmentNameSchema,
  status: DeploymentStatusSchema,
  phase: DeploymentPhaseSchema,
  steps: z.array(DeploymentStepDtoSchema),
  branch: z.string().nullable(),
  commitSha: z.string().nullable(),
  commitMessage: z.string().nullable(),
  sourceLabel: z.string(),
  triggeredBy: DeploymentTriggerDtoSchema,
  createdAt: TimestampSchema,
  startedAt: TimestampSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
  failure: DeploymentFailureDtoSchema.nullable(),
})
export type DeploymentDTO = z.infer<typeof DeploymentDtoSchema>
