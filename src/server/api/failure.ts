import "server-only"
import type { ApiErrorCode } from "@/lib/api/contracts/error"

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CSRF_FAILED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PORT_CONFLICT: 409,
  DOMAIN_EXISTS: 409,
  IDEMPOTENCY_CONFLICT: 409,
  DEPLOYMENT_NOT_CANCELABLE: 409,
  SERVER_NOT_ENROLLED: 409,
  GIT_INSTALLATION_UNAVAILABLE: 409,
  RATE_LIMITED: 429,
  FEATURE_NOT_AVAILABLE: 501,
  SERVER_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
}

/**
 * An expected, user-safe failure. The message and details are returned to the client
 * as-is, so they must never contain secrets, SQL, paths, or stack traces.
 */
export class ApiFailure extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: Record<string, unknown> | undefined
  readonly headers: Record<string, string> | undefined

  constructor(code: ApiErrorCode, message: string, options: { details?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
    super(message)
    this.name = "ApiFailure"
    this.code = code
    this.status = STATUS[code]
    this.details = options.details
    this.headers = options.headers
  }
}

export const notFound = (what = "That resource") => new ApiFailure("NOT_FOUND", `${what} was not found.`)
