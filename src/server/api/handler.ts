import "server-only"
import { randomUUID } from "node:crypto"
import { ZodError, type ZodType } from "zod"
import type { ApiErrorResponse } from "@/lib/api/contracts/error"
import { CSRF_COOKIE, readCookie, SESSION_COOKIE } from "@/server/api/cookies"
import { ApiFailure } from "@/server/api/failure"
import type { Actor } from "@/server/auth/authorize"
import { resolveSession, type SessionContext } from "@/server/auth/session"
import { ConfigError, providerMode } from "@/server/config"
import { safeEqual, sha256Hex } from "@/server/crypto/tokens"
import { db } from "@/server/db/client"
import { log } from "@/server/security/log"
import { isTrustedOrigin } from "@/server/security/origin"
import { validateIdempotencyKey } from "@/server/services/idempotency"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const MAX_BODY_BYTES = 256 * 1024

export interface RouteContext<P> {
  request: Request
  requestId: string
  params: P
  /** Parses and validates the JSON body. Throws VALIDATION_FAILED on bad input. */
  body<T>(schema: ZodType<T>): Promise<T>
  /** The validated Idempotency-Key header, or null when absent. */
  idempotencyKey(): string | null
}

export interface AuthedContext<P> extends RouteContext<P> {
  session: SessionContext
  actor: Actor
}

export interface ApiResult {
  status?: number
  body?: unknown
  headers?: Record<string, string>
  cookies?: string[]
}

type Handler<P, C> = (ctx: C) => Promise<ApiResult | Response>
type NextHandler<P> = (request: Request, context: { params: Promise<P> }) => Promise<Response>

function respond(requestId: string, result: ApiResult): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Request-ID": requestId,
    ...result.headers,
  })
  for (const cookie of result.cookies ?? []) headers.append("Set-Cookie", cookie)
  const status = result.status ?? 200
  return new Response(status === 204 ? null : JSON.stringify(result.body ?? null), { status, headers })
}

function errorResponse(requestId: string, failure: ApiFailure): Response {
  const body: ApiErrorResponse = {
    error: { code: failure.code, message: failure.message, requestId, ...(failure.details ? { details: failure.details } : {}) },
  }
  return respond(requestId, { status: failure.status, body, headers: failure.headers })
}

function pgCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return ""
  if ("code" in error && typeof error.code === "string") return error.code
  // Drizzle wraps driver errors; the PostgreSQL code sits on the cause.
  if ("cause" in error) return pgCode(error.cause)
  return ""
}

function isUniqueViolation(error: unknown): boolean {
  return pgCode(error) === "23505"
}

function isDatabaseUnavailable(error: unknown): boolean {
  const code = pgCode(error)
  return ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P03", "53300"].includes(code)
}

/** Maps anything thrown to a safe failure. Unexpected errors are logged, never returned. */
export function toFailure(error: unknown, requestId: string): ApiFailure {
  if (error instanceof ApiFailure) return error
  if (error instanceof ZodError) {
    const issues = error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    return new ApiFailure("VALIDATION_FAILED", issues[0]?.message ?? "Check the request.", { details: { issues } })
  }
  if (error instanceof ConfigError) {
    log("error", "config.invalid", { requestId, message: error.message })
    return new ApiFailure("SERVICE_UNAVAILABLE", "The control plane is not configured correctly. Check the server logs.")
  }
  if (isUniqueViolation(error)) return new ApiFailure("CONFLICT", "That already exists.")
  if (isDatabaseUnavailable(error)) {
    log("error", "database.unavailable", { requestId })
    return new ApiFailure("SERVICE_UNAVAILABLE", "The control plane database is unavailable.")
  }
  log("error", "request.failed", { requestId, error: error instanceof Error ? error.name : typeof error })
  return new ApiFailure("INTERNAL_ERROR", "The control plane could not complete the request.")
}

async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_BODY_BYTES) throw new ApiFailure("VALIDATION_FAILED", "The request body is too large.")
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new ApiFailure("VALIDATION_FAILED", "The request body is too large.")
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiFailure("VALIDATION_FAILED", "The request body must be JSON.")
  }
  return schema.parse(parsed)
}

function baseContext<P>(request: Request, requestId: string, params: P): RouteContext<P> {
  return {
    request,
    requestId,
    params,
    body: (schema) => readJson(request, schema),
    idempotencyKey: () => validateIdempotencyKey(request.headers.get("idempotency-key")),
  }
}

function guard(request: Request) {
  if (providerMode() !== "server") throw new ApiFailure("FEATURE_NOT_AVAILABLE", "The control plane API runs only when ARCELLITE_PROVIDER=server.")
  if (!SAFE_METHODS.has(request.method) && !isTrustedOrigin(request)) {
    throw new ApiFailure("CSRF_FAILED", "This request did not come from Arcellite Deploy.")
  }
}

async function run(requestId: string, work: () => Promise<ApiResult | Response>): Promise<Response> {
  try {
    const result = await work()
    if (result instanceof Response) {
      result.headers.set("X-Request-ID", requestId)
      return result
    }
    return respond(requestId, result)
  } catch (error) {
    return errorResponse(requestId, toFailure(error, requestId))
  }
}

/** A route that needs no session (health, sign-in, setup). Unsafe methods still require a trusted Origin. */
export function publicRoute<P = Record<string, never>>(handler: Handler<P, RouteContext<P>>): NextHandler<P> {
  return async (request, context) => {
    const requestId = randomUUID()
    return run(requestId, async () => {
      guard(request)
      return handler(baseContext(request, requestId, await context.params))
    })
  }
}

/**
 * A route that requires a signed-in session. Unsafe methods additionally require a trusted
 * Origin and an X-CSRF-Token header that matches both the CSRF cookie and the token hash
 * stored with the session.
 */
export function sessionRoute<P = Record<string, never>>(handler: Handler<P, AuthedContext<P>>): NextHandler<P> {
  return async (request, context) => {
    const requestId = randomUUID()
    return run(requestId, async () => {
      guard(request)
      const cookies = request.headers.get("cookie")
      const session = await resolveSession(db(), readCookie(cookies, SESSION_COOKIE))
      if (!session) throw new ApiFailure("UNAUTHORIZED", "Sign in to continue.")
      if (!SAFE_METHODS.has(request.method)) {
        const header = request.headers.get("x-csrf-token") ?? ""
        const cookie = readCookie(cookies, CSRF_COOKIE) ?? ""
        if (!header || !safeEqual(header, cookie) || !safeEqual(sha256Hex(header), session.csrfTokenHash)) {
          throw new ApiFailure("CSRF_FAILED", "The request is missing a valid CSRF token. Reload the page and try again.")
        }
      }
      const actor: Actor = {
        userId: session.userId,
        displayName: session.displayName,
        workspaceId: session.workspaceId,
        role: session.role,
        requestId,
        sessionId: session.sessionId,
      }
      return handler({ ...baseContext(request, requestId, await context.params), session, actor })
    })
  }
}
