import { afterEach, describe, expect, it, vi } from "vitest"
import { toFailure } from "@/server/api/handler"
import { ApiFailure } from "@/server/api/failure"
import { ConfigError, providerMode, secureCookies } from "@/server/config"
import { log, redact } from "./log"
import { isTrustedOrigin } from "./origin"

const ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ENV }
  vi.restoreAllMocks()
})

function request(origin: string | null, host = "localhost:3000") {
  const headers = new Headers({ host })
  if (origin !== null) headers.set("origin", origin)
  return new Request("http://localhost:3000/api/v1/projects", { method: "POST", headers })
}

describe("redaction", () => {
  it("masks sensitive keys at any depth and credentials inside strings", () => {
    const out = JSON.stringify(
      redact({ password: "p", nested: { sessionToken: "t", csrf: "c", apiKey: "k", value: "v" }, url: "postgres://user:pw@db/x", query: "a=1&token=abc" }),
    )
    for (const leaked of ['"p"', '"t"', '"c"', '"k"', '"v"', ":pw@", "token=abc"]) expect(out).not.toContain(leaked)
  })

  it("log() never prints a secret passed by mistake", () => {
    delete process.env.ARCELLITE_LOG_SILENT
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    log("info", "test", { password: "hunter2-secret", masterKey: "k3y", detail: { secret: "s3cret" } })
    const line = spy.mock.calls[0][0] as string
    expect(JSON.parse(line)).toMatchObject({ level: "info", event: "test" })
    expect(line).not.toMatch(/hunter2|k3y|s3cret/)
  })
})

describe("error mapping", () => {
  it("hides unexpected errors behind a generic message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const failure = toFailure(new Error("relation users does not exist at /srv/app/db.ts:12"), "req-1")
    expect(failure.code).toBe("INTERNAL_ERROR")
    expect(failure.message).not.toMatch(/relation|\.ts|srv/)
  })

  it("maps database outages and misconfiguration to SERVICE_UNAVAILABLE", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(toFailure(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }), "r").code).toBe("SERVICE_UNAVAILABLE")
    expect(toFailure({ cause: { code: "57P01" } }, "r").code).toBe("SERVICE_UNAVAILABLE")
    const config = toFailure(new ConfigError("ARCELLITE_MASTER_KEY must decode to exactly 32 bytes"), "r")
    expect(config.code).toBe("SERVICE_UNAVAILABLE")
    expect(config.message).not.toContain("ARCELLITE_MASTER_KEY")
  })

  it("maps unique violations to CONFLICT and keeps expected failures", () => {
    expect(toFailure({ cause: { code: "23505", detail: "Key (login_normalized)=(ada) already exists." } }, "r")).toMatchObject({ code: "CONFLICT", message: "That already exists." })
    const expected = new ApiFailure("PORT_CONFLICT", "8080 is taken.")
    expect(toFailure(expected, "r")).toBe(expected)
  })
})

describe("origin checks", () => {
  it("accepts only a loopback origin addressed to itself when nothing is configured", () => {
    expect(isTrustedOrigin(request("http://localhost:3000"))).toBe(true)
    expect(isTrustedOrigin(request(null))).toBe(false)
    expect(isTrustedOrigin(request("null"))).toBe(false)
    expect(isTrustedOrigin(request("http://192.168.1.50:3000", "192.168.1.50:3000"))).toBe(false)
    expect(isTrustedOrigin(request("http://localhost:3000", "evil.example"))).toBe(false)
  })

  it("accepts exactly the configured origins", () => {
    process.env.ARCELLITE_APP_URL = "https://deploy.example.com/"
    process.env.ARCELLITE_TRUSTED_ORIGINS = "http://192.168.1.50:3000"
    expect(isTrustedOrigin(request("https://deploy.example.com", "deploy.example.com"))).toBe(true)
    expect(isTrustedOrigin(request("http://192.168.1.50:3000", "192.168.1.50:3000"))).toBe(true)
    expect(isTrustedOrigin(request("http://localhost:3000"))).toBe(false)
    expect(isTrustedOrigin(request("https://deploy.example.com.evil.io"))).toBe(false)
  })
})

describe("configuration", () => {
  it("defaults to the mock provider and rejects unknown modes", () => {
    delete process.env.ARCELLITE_PROVIDER
    expect(providerMode()).toBe("mock")
    process.env.ARCELLITE_PROVIDER = "docker"
    expect(() => providerMode()).toThrow(ConfigError)
  })

  it("marks cookies Secure in production unless explicitly disabled", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(secureCookies()).toBe(true)
    process.env.ARCELLITE_INSECURE_COOKIES = "true"
    expect(secureCookies()).toBe(false)
    vi.unstubAllEnvs()
  })
})
