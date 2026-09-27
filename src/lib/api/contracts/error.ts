import { z } from "zod"

/**
 * Stable machine-readable error identities. The message is for people; the code is
 * what clients branch on. Add codes only when a caller needs to tell them apart.
 */
export const API_ERROR_CODES = [
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "PORT_CONFLICT",
  "DOMAIN_EXISTS",
  "IDEMPOTENCY_CONFLICT",
  "SERVER_NOT_ENROLLED",
  "SERVER_UNAVAILABLE",
  "GIT_INSTALLATION_UNAVAILABLE",
  "DEPLOYMENT_NOT_CANCELABLE",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CSRF_FAILED",
  "RATE_LIMITED",
  "FEATURE_NOT_AVAILABLE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES)
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>

/**
 * Transport error. Never carries stack traces, file paths, raw exceptions, or secrets.
 * `details` holds small, safe, structured context such as `{ field: "exposedPort", port: 8082 }`.
 * Conflicts that need more identity (project version, running deployment) use CONFLICT
 * with details until a caller needs a dedicated code.
 */
export const ApiErrorSchema = z.strictObject({
  code: ApiErrorCodeSchema,
  message: z.string().min(1).max(2000),
  requestId: z.string().min(1).max(128).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Body of a failed API response. */
export const ApiErrorResponseSchema = z.strictObject({ error: ApiErrorSchema })
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
