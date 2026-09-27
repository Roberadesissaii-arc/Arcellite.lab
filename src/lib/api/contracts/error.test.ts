import { describe, expect, it } from "vitest"
import { fromApiError, parseApiErrorResponse, toApiError } from "@/lib/deploy/errors"
import { DeployError } from "@/lib/deploy/types"
import { ApiErrorResponseSchema, ApiErrorSchema } from "./error"

describe("ApiError", () => {
  it("accepts the safe shape and rejects extra fields such as a stack", () => {
    expect(ApiErrorSchema.safeParse({ code: "PORT_CONFLICT", message: "Port 8082 is already in use.", requestId: "req_1" }).success).toBe(true)
    expect(ApiErrorSchema.safeParse({ code: "PORT_CONFLICT", message: "x", stack: "Error: at …" }).success).toBe(false)
    expect(ApiErrorSchema.safeParse({ code: "MADE_UP", message: "x" }).success).toBe(false)
    expect(ApiErrorResponseSchema.safeParse({ error: { code: "NOT_FOUND", message: "Gone." } }).success).toBe(true)
  })

  it("converts a DeployError, keeping code, request ID, and details", () => {
    const error = new DeployError("Port unavailable", "8082 is already assigned on this server.", {
      code: "PORT_CONFLICT",
      requestId: "req_42",
      details: { field: "exposedPort", port: 8082 },
    })
    expect(toApiError(error)).toEqual({
      code: "PORT_CONFLICT",
      message: "8082 is already assigned on this server.",
      requestId: "req_42",
      details: { field: "exposedPort", port: 8082 },
    })
  })

  it("maps unknown errors to a safe INTERNAL_ERROR without their message or stack", () => {
    const apiError = toApiError(new Error("ECONNREFUSED /var/run/docker.sock password=hunter2"))
    expect(apiError.code).toBe("INTERNAL_ERROR")
    const json = JSON.stringify(apiError)
    expect(json).not.toContain("docker.sock")
    expect(json).not.toContain("hunter2")
    expect(json).not.toContain("stack")
    expect(ApiErrorSchema.safeParse(apiError).success).toBe(true)
  })

  it("does not serialize a stack from a DeployError", () => {
    expect(JSON.stringify(toApiError(new DeployError("Not found", "Gone.", { code: "NOT_FOUND" })))).not.toContain("at ")
  })

  it("rebuilds the UI error so existing instanceof checks keep working", () => {
    const error = fromApiError({ code: "SERVER_UNAVAILABLE", message: "home-server is offline.", requestId: "req_7" })
    expect(error).toBeInstanceOf(DeployError)
    expect(error.title).toBe("Server unavailable")
    expect(error.detail).toBe("home-server is offline.")
    expect(error.code).toBe("SERVER_UNAVAILABLE")
    expect(error.requestId).toBe("req_7")
  })

  it("treats a malformed error body as INTERNAL_ERROR and keeps the request ID", () => {
    const error = parseApiErrorResponse("<html>502</html>", "req_9")
    expect(error.code).toBe("INTERNAL_ERROR")
    expect(error.requestId).toBe("req_9")
    expect(parseApiErrorResponse({ error: { code: "RATE_LIMITED", message: "Slow down." } }).code).toBe("RATE_LIMITED")
  })

  it("defaults a DeployError without a code to INTERNAL_ERROR", () => {
    expect(new DeployError("Oops", "Something failed.").code).toBe("INTERNAL_ERROR")
  })
})
