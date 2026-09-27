import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/server/db/client"
import { projects } from "@/server/db/schema"
import { Browser, bootstrapOwner, call, createProject, json, OWNER, projectBody, resetDatabase, routes, signIn, type RouteHandler } from "./harness"

const createRoute = routes.projects.POST as RouteHandler

let browser: Browser
beforeEach(async () => {
  await resetDatabase()
  browser = await bootstrapOwner()
})

async function code(response: Response) {
  return (await json<{ error: { code: string } }>(response)).error.code
}

describe("CSRF and Origin", () => {
  it("12. rejects an authenticated unsafe request without the CSRF header", async () => {
    const response = await browser.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody(), csrf: null })
    expect(response.status).toBe(403)
    expect(await code(response)).toBe("CSRF_FAILED")
    expect(await db().select().from(projects)).toHaveLength(0)
  })

  it("13. rejects a wrong CSRF token, including another session's valid token", async () => {
    const wrong = await browser.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody(), csrf: "x".repeat(43) })
    expect(wrong.status).toBe(403)
    const other = Browser.from(await signIn(OWNER.login, OWNER.password))
    // Header and cookie agree, but the token belongs to a different session.
    const swapped = new Browser(browser.session, other.csrf)
    const response = await swapped.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody() })
    expect(response.status).toBe(403)
    // Header differs from the cookie.
    const mismatch = await browser.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody(), csrf: other.csrf })
    expect(mismatch.status).toBe(403)
    expect(await db().select().from(projects)).toHaveLength(0)
  })

  it("14. rejects a foreign or missing Origin, even with a valid CSRF token", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { origin: "http://localhost:3000.evil.example" }, { origin: "null" }]) {
      const response = await browser.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody(), headers })
      expect(response.status, headers.origin).toBe(403)
      expect(await code(response)).toBe("CSRF_FAILED")
    }
    const missing = await browser.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody(), noOrigin: true })
    expect(missing.status).toBe(403)
    // A loopback Origin addressed to a different Host (DNS rebinding) is refused too.
    const rebind = await browser.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody(), headers: { host: "attacker.example:3000" } })
    expect(rebind.status).toBe(403)
    // X-Forwarded-Host is never trusted.
    const forwarded = await browser.call(createRoute, "/api/v1/projects", {
      method: "POST",
      body: projectBody(),
      headers: { origin: "https://evil.example", "x-forwarded-host": "evil.example" },
    })
    expect(forwarded.status).toBe(403)
    expect(await db().select().from(projects)).toHaveLength(0)
  })

  it("login and bootstrap refuse an untrusted Origin", async () => {
    const login = await call(routes.login.POST as RouteHandler, "/api/v1/auth/login", {
      method: "POST",
      body: { login: OWNER.login, password: OWNER.password },
      headers: { origin: "https://evil.example" },
    })
    expect(login.status).toBe(403)
    expect(login.headers.getSetCookie()).toEqual([])
    await resetDatabase()
    const setup = await call(routes.bootstrap.POST as RouteHandler, "/api/v1/auth/bootstrap", {
      method: "POST",
      noOrigin: true,
      body: { ...OWNER, passwordConfirmation: OWNER.password },
    })
    expect(setup.status).toBe(403)
  })

  it("trusts only the configured origins when ARCELLITE_APP_URL is set", async () => {
    process.env.ARCELLITE_APP_URL = "https://deploy.example.com"
    try {
      const loopback = await createProject(browser)
      expect(loopback.status).toBe(403)
      const configured = await browser.call(createRoute, "/api/v1/projects", { method: "POST", body: projectBody(), headers: { origin: "https://deploy.example.com", host: "deploy.example.com" } })
      expect(configured.status).toBe(201)
    } finally {
      delete process.env.ARCELLITE_APP_URL
    }
  })

  it("15. does not require CSRF for GET", async () => {
    const response = await browser.call(routes.projects.GET as RouteHandler, "/api/v1/projects", { csrf: null, noOrigin: true })
    expect(response.status).toBe(200)
  })

  it("never answers with a wildcard CORS header", async () => {
    const response = await browser.call(routes.projects.GET as RouteHandler, "/api/v1/projects", { headers: { origin: "https://evil.example" } })
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })
})
