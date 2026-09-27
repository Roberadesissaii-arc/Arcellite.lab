import { ApiErrorSchema, type ApiError, type ApiErrorCode } from "@/lib/api/contracts/error"
import { DeployError } from "./types"

/*
 * The bridge between the transport error (ApiError, stable `code`) and what the UI shows
 * today (DeployError, `title` + `detail`). A server provider turns every failed response
 * into a DeployError with `fromApiError`, so `error instanceof DeployError` call sites keep
 * working and gain a code to branch on.
 */

/** Short headings for errors that arrive with a code but no UI title. */
const TITLES: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: "Check the form",
  NOT_FOUND: "Not found",
  CONFLICT: "Already changed",
  PORT_CONFLICT: "Port unavailable",
  DOMAIN_EXISTS: "Domain already added",
  IDEMPOTENCY_CONFLICT: "Request already used",
  SERVER_NOT_ENROLLED: "No server",
  SERVER_UNAVAILABLE: "Server unavailable",
  GIT_INSTALLATION_UNAVAILABLE: "Repository access lost",
  DEPLOYMENT_NOT_CANCELABLE: "Deployment already finished",
  UNAUTHORIZED: "Sign in again",
  FORBIDDEN: "Not allowed",
  CSRF_FAILED: "Request blocked",
  RATE_LIMITED: "Too many requests",
  FEATURE_NOT_AVAILABLE: "Not available yet",
  SERVICE_UNAVAILABLE: "Control plane unavailable",
  INTERNAL_ERROR: "Something failed",
}

const INTERNAL_MESSAGE = "The control plane could not complete the request."

/** Turns any thrown value into a safe ApiError. Unknown errors never expose their message or stack. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof DeployError) {
    const apiError: ApiError = { code: error.code, message: error.detail || error.title }
    if (error.requestId) apiError.requestId = error.requestId
    if (error.details) apiError.details = error.details
    return apiError
  }
  return { code: "INTERNAL_ERROR", message: INTERNAL_MESSAGE }
}

/** Rebuilds the UI error from a transport error, keeping its code and request ID. */
export function fromApiError(apiError: ApiError): DeployError {
  return new DeployError(TITLES[apiError.code], apiError.message, {
    code: apiError.code,
    requestId: apiError.requestId,
    details: apiError.details,
  })
}

/** Parses an error response body; anything malformed becomes a safe INTERNAL_ERROR. */
export function parseApiErrorResponse(body: unknown, requestId?: string): DeployError {
  const parsed = ApiErrorSchema.safeParse(typeof body === "object" && body !== null && "error" in body ? body.error : undefined)
  if (parsed.success) return fromApiError(parsed.data)
  return fromApiError({ code: "INTERNAL_ERROR", message: INTERNAL_MESSAGE, ...(requestId ? { requestId } : {}) })
}
