import { describe, expect, it, vi } from "vitest"
import { DeployError } from "@/lib/deploy/types"
import { createApiClient } from "./client"

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  // Parameters are declared so the mock's calls are typed for the assertions below.
  return vi.fn(async (...args: [string, RequestInit?]) => {
    void args
    return new Response(body === null ? null : JSON.stringify(body), { status, headers })
  })
}

describe("API client", () => {
  it("sends the CSRF header and Idempotency-Key on unsafe requests only", async () => {
    const fetch = fakeFetch(201, { ok: true })
    const client = createApiClient({ fetch: fetch as unknown as typeof globalThis.fetch, readCookie: (name) => (name === "arcellite_csrf" ? "csrf-123" : null) })
    await client.request("POST", "/api/v1/projects", { body: { a: 1 }, idempotencyKey: "key-1" })
    await client.get("/api/v1/projects")
    const [postUrl, post] = fetch.mock.calls[0]
    const postHeaders = new Headers(post!.headers)
    expect(postUrl).toBe("/api/v1/projects")
    expect(post!.credentials).toBe("same-origin")
    expect(postHeaders.get("x-csrf-token")).toBe("csrf-123")
    expect(postHeaders.get("idempotency-key")).toBe("key-1")
    expect(post!.body).toBe(JSON.stringify({ a: 1 }))
    expect(new Headers(fetch.mock.calls[1][1]!.headers).get("x-csrf-token")).toBeNull()
  })

  it("turns an ApiError response into a DeployError with code and request ID", async () => {
    const client = createApiClient({ fetch: fakeFetch(409, { error: { code: "PORT_CONFLICT", message: "8080 is taken.", requestId: "req-9" } }) as unknown as typeof fetch })
    const error = await client.request("POST", "/x", { body: {} }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DeployError)
    expect(error).toMatchObject({ code: "PORT_CONFLICT", detail: "8080 is taken.", requestId: "req-9", title: "Port unavailable" })
  })

  it("maps a malformed error body and a network failure to safe errors", async () => {
    const html = createApiClient({ fetch: vi.fn(async () => new Response("<html>stack trace</html>", { status: 500, headers: { "x-request-id": "r" } })) as unknown as typeof fetch })
    const error = await html.get("/x").catch((caught: unknown) => caught as DeployError)
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", requestId: "r" })
    expect((error as DeployError).detail).not.toContain("stack")
    const offline = createApiClient({ fetch: vi.fn(async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch })
    expect(await offline.get("/x").catch((caught: unknown) => caught)).toMatchObject({ code: "SERVICE_UNAVAILABLE" })
  })

  it("calls onUnauthorized on 401 and supports abort", async () => {
    const onUnauthorized = vi.fn()
    const client = createApiClient({ fetch: fakeFetch(401, { error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }) as unknown as typeof fetch, onUnauthorized })
    await client.get("/x").catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledOnce()

    const controller = new AbortController()
    const aborting = createApiClient({
      fetch: vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as unknown as typeof fetch,
    })
    const pending = aborting.get("/slow", { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("returns undefined for 204 and validates bodies against a schema", async () => {
    expect(await createApiClient({ fetch: fakeFetch(204, null) as unknown as typeof fetch }).request("DELETE", "/x")).toBeUndefined()
    const { z } = await import("zod")
    const client = createApiClient({ fetch: fakeFetch(200, { unexpected: true }) as unknown as typeof fetch })
    await expect(client.get("/x", { schema: z.strictObject({ id: z.string() }) })).rejects.toMatchObject({ code: "INTERNAL_ERROR" })
  })
})
