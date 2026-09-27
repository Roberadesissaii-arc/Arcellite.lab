import type { ZodType } from "zod"
import { parseApiErrorResponse } from "@/lib/deploy/errors"
import { DeployError } from "@/lib/deploy/types"

/*
 * The browser's only way to reach the control plane. Every call:
 * - sends cookies (same origin only) and, for state changes, the X-CSRF-Token header read
 *   from the non-HttpOnly arcellite_csrf cookie;
 * - carries an Idempotency-Key when the caller supplies one (one per user intent);
 * - turns failures into DeployError with the server's code and request ID;
 * - can be aborted.
 */

export const CSRF_COOKIE = "arcellite_csrf"

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export interface RequestOptions<T> {
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
  /** Validates the success body. Without it the body is returned unchecked. */
  schema?: ZodType<T>
}

export interface ApiClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
  /** Reads a cookie by name; defaults to document.cookie. */
  readCookie?: (name: string) => string | null
  /** Called when the server answers 401, before the error is thrown. */
  onUnauthorized?: () => void
}

export interface ApiClient {
  request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions<T>): Promise<T>
  get<T = unknown>(path: string, options?: Omit<RequestOptions<T>, "body" | "idempotencyKey">): Promise<T>
}

function documentCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  for (const part of document.cookie.split(";")) {
    const index = part.indexOf("=")
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return null
}

const UNAVAILABLE = () =>
  new DeployError("Control plane unavailable", "Arcellite could not reach its control plane. Check that the server is running.", { code: "SERVICE_UNAVAILABLE" })

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? ""
  const readCookie = options.readCookie ?? documentCookie

  async function request<T>(method: HttpMethod, path: string, requestOptions: RequestOptions<T> = {}): Promise<T> {
    const fetcher = options.fetch ?? globalThis.fetch
    const headers = new Headers({ Accept: "application/json" })
    if (requestOptions.body !== undefined) headers.set("Content-Type", "application/json")
    if (method !== "GET") {
      const csrf = readCookie(CSRF_COOKIE)
      if (csrf) headers.set("X-CSRF-Token", csrf)
    }
    if (requestOptions.idempotencyKey) headers.set("Idempotency-Key", requestOptions.idempotencyKey)

    let response: Response
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        method,
        headers,
        body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
        credentials: "same-origin",
        cache: "no-store",
        signal: requestOptions.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
      throw UNAVAILABLE()
    }

    const requestId = response.headers.get("x-request-id") ?? undefined
    if (response.status === 204) return undefined as T
    let body: unknown = null
    const text = await response.text()
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = null
      }
    }
    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized?.()
      throw parseApiErrorResponse(body, requestId)
    }
    if (!requestOptions.schema) return body as T
    const parsed = requestOptions.schema.safeParse(body)
    if (!parsed.success) {
      throw new DeployError("Something failed", "The control plane sent a response this page does not understand. Reload and try again.", {
        code: "INTERNAL_ERROR",
        requestId,
      })
    }
    return parsed.data
  }

  return {
    request,
    get: (path, getOptions) => request("GET", path, getOptions),
  }
}
