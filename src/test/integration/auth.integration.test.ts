import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { sha256Hex } from "@/server/crypto/tokens"
import { db } from "@/server/db/client"
import { auditLog, rateLimits, sessions, users, workspaceMembers, workspaces } from "@/server/db/schema"
import { Browser, bootstrapOwner, call, json, OWNER, resetDatabase, routes, signIn, type RouteHandler } from "./harness"

const me = routes.me.GET as RouteHandler
const logout = routes.logout.POST as RouteHandler
const bootstrap = routes.bootstrap.POST as RouteHandler

beforeEach(resetDatabase)

describe("owner bootstrap", () => {
  it("reports that setup is required on an empty database", async () => {
    const response = await call(routes.status.GET as RouteHandler, "/api/v1/auth/status")
    expect(await json(response)).toEqual({ setupRequired: true, authenticated: false })
  })

  it("1. creates the first owner, the Arcellite Lab workspace, and a session", async () => {
    const browser = await bootstrapOwner()
    const body = await json<{ user: { login: string }; workspace: { name: string }; role: string }>(await browser.call(me, "/api/v1/auth/me"))
    expect(body.user.login).toBe(OWNER.login)
    expect(body.workspace.name).toBe("Arcellite Lab")
    expect(body.role).toBe("owner")
    const [audit] = await db().select().from(auditLog).where(eq(auditLog.action, "auth.bootstrap"))
    expect(audit.outcome).toBe("success")
  })

  it("2. rejects a second bootstrap", async () => {
    await bootstrapOwner()
    const response = await call(bootstrap, "/api/v1/auth/bootstrap", {
      method: "POST",
      body: { displayName: "Mallory", login: "mallory", password: "another long password", passwordConfirmation: "another long password" },
    })
    expect(response.status).toBe(409)
    expect(response.headers.getSetCookie()).toEqual([])
    const [{ total }] = await db().select({ total: sql<number>`count(*)::int` }).from(users)
    expect(total).toBe(1)
  })

  it("3. never creates two initial owners under concurrent bootstrap", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        call(bootstrap, "/api/v1/auth/bootstrap", {
          method: "POST",
          body: { displayName: `Racer ${index}`, login: `racer${index}`, password: "a long enough password", passwordConfirmation: "a long enough password" },
        }),
      ),
    )
    expect(attempts.filter((response) => response.status === 201)).toHaveLength(1)
    expect(attempts.filter((response) => response.status === 409)).toHaveLength(5)
    const owners = await db().select().from(workspaceMembers).where(eq(workspaceMembers.role, "owner"))
    expect(owners).toHaveLength(1)
    expect(await db().select().from(workspaces)).toHaveLength(1)
  })

  it("validates the bootstrap body with field details", async () => {
    const response = await call(bootstrap, "/api/v1/auth/bootstrap", {
      method: "POST",
      body: { displayName: "A", login: "a@example.com", password: "short", passwordConfirmation: "short" },
    })
    expect(response.status).toBe(400)
    const body = await json<{ error: { code: string; details: { issues: { path: string }[] } } }>(response)
    expect(body.error.code).toBe("VALIDATION_FAILED")
    expect(body.error.details.issues.map((issue) => issue.path)).toContain("password")
  })

  it("4. stores the password only as an Argon2id hash", async () => {
    await bootstrapOwner()
    const [user] = await db().select().from(users)
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true)
    expect(user.passwordHash).not.toContain(OWNER.password)
    const dump = JSON.stringify(await db().execute(sql`select * from users`))
    expect(dump).not.toContain(OWNER.password)
  })
})

describe("sign in", () => {
  beforeEach(async () => {
    await bootstrapOwner()
  })

  it("5. signs in with the correct password, case-insensitively on the identity", async () => {
    const response = await signIn(" ADA@Example.com ", OWNER.password)
    expect(response.status).toBe(200)
    const browser = Browser.from(response)
    expect((await browser.call(me, "/api/v1/auth/me")).status).toBe(200)
  })

  it("6. fails generically for a wrong password and for an unknown identity", async () => {
    const wrong = await signIn(OWNER.login, "not the password at all")
    const unknown = await signIn("nobody@example.com", "not the password at all")
    for (const response of [wrong, unknown]) {
      expect(response.status).toBe(401)
      expect(response.headers.getSetCookie()).toEqual([])
      const body = await json<{ error: { code: string; message: string } }>(response)
      expect(body.error).toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials." })
    }
  })

  it("7. throttles an identity after five failures, even for the right password", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await signIn(OWNER.login, "wrong password!!")).status).toBe(401)
    const blocked = await signIn(OWNER.login, OWNER.password)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await json<{ error: { code: string } }>(blocked)).error.code).toBe("RATE_LIMITED")
    // The limit is keyed by a hash of the normalized identity, never the identity itself.
    const rows = await db().select().from(rateLimits)
    expect(rows.every((row) => !row.key.includes("ada"))).toBe(true)
    // Another identity is unaffected.
    expect((await signIn("someone-else", "wrong password!!")).status).toBe(401)
  })

  it("a successful sign-in clears earlier failures", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await signIn(OWNER.login, "wrong password!!")
    expect((await signIn(OWNER.login, OWNER.password)).status).toBe(200)
    for (let attempt = 0; attempt < 4; attempt += 1) expect((await signIn(OWNER.login, "wrong password!!")).status).toBe(401)
  })

  it("refuses a disabled user with the same generic message", async () => {
    await db().update(users).set({ disabledAt: new Date() })
    const response = await signIn(OWNER.login, OWNER.password)
    expect(response.status).toBe(401)
    expect((await json<{ error: { message: string } }>(response)).error.message).toBe("Invalid credentials.")
  })
})

describe("sessions", () => {
  it("issues HttpOnly, SameSite=Lax, Path=/ cookies; the CSRF cookie is readable by scripts", async () => {
    const response = await call(bootstrap, "/api/v1/auth/bootstrap", { method: "POST", body: { ...OWNER, passwordConfirmation: OWNER.password } })
    const [session, csrf] = response.headers.getSetCookie()
    expect(session).toMatch(/^arcellite_session=/)
    expect(session).toContain("HttpOnly")
    expect(session).toContain("SameSite=Lax")
    expect(session).toContain("Path=/")
    expect(csrf).toMatch(/^arcellite_csrf=/)
    expect(csrf).not.toContain("HttpOnly")
  })

  it("8. stores only hashes of the session and CSRF tokens", async () => {
    await resetDatabase()
    const browser = await bootstrapOwner()
    const [row] = await db().select().from(sessions)
    expect(row.tokenHash).toBe(sha256Hex(browser.session))
    expect(row.csrfTokenHash).toBe(sha256Hex(browser.csrf))
    const dump = JSON.stringify(await db().execute(sql`select * from sessions`))
    expect(dump).not.toContain(browser.session)
    expect(dump).not.toContain(browser.csrf)
    // 256-bit tokens.
    expect(Buffer.from(browser.session, "base64url")).toHaveLength(32)
  })

  it("9. rejects an expired session (absolute and idle)", async () => {
    await resetDatabase()
    const browser = await bootstrapOwner()
    await db().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) })
    expect((await browser.call(me, "/api/v1/auth/me")).status).toBe(401)

    await resetDatabase()
    const idle = await bootstrapOwner()
    await db().update(sessions).set({ lastSeenAt: new Date(Date.now() - 13 * 60 * 60 * 1000) })
    expect((await idle.call(me, "/api/v1/auth/me")).status).toBe(401)
  })

  it("10. rejects a revoked session", async () => {
    await resetDatabase()
    const browser = await bootstrapOwner()
    await db().update(sessions).set({ revokedAt: new Date() })
    expect((await browser.call(me, "/api/v1/auth/me")).status).toBe(401)
  })

  it("11. logout revokes the session immediately and clears cookies", async () => {
    await resetDatabase()
    const browser = await bootstrapOwner()
    const response = await browser.call(logout, "/api/v1/auth/logout", { method: "POST" })
    expect(response.status).toBe(204)
    expect(response.headers.getSetCookie().every((cookie) => cookie.includes("Max-Age=0"))).toBe(true)
    const [row] = await db().select().from(sessions)
    expect(row.revokedAt).not.toBeNull()
    expect((await browser.call(me, "/api/v1/auth/me")).status).toBe(401)
  })

  it("rejects a disabled user's existing session", async () => {
    await resetDatabase()
    const browser = await bootstrapOwner()
    await db().update(users).set({ disabledAt: new Date() })
    expect((await browser.call(me, "/api/v1/auth/me")).status).toBe(401)
  })

  it("throttles last_seen writes", async () => {
    await resetDatabase()
    const browser = await bootstrapOwner()
    const [before] = await db().select().from(sessions)
    await browser.call(me, "/api/v1/auth/me")
    const [after] = await db().select().from(sessions)
    expect(after.lastSeenAt.getTime()).toBe(before.lastSeenAt.getTime())
    await db().update(sessions).set({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) })
    await browser.call(me, "/api/v1/auth/me")
    const [refreshed] = await db().select().from(sessions)
    expect(Date.now() - refreshed.lastSeenAt.getTime()).toBeLessThan(60_000)
  })

  it("requires a session for every workspace route", async () => {
    await resetDatabase()
    await bootstrapOwner()
    for (const [handler, path] of [
      [routes.me.GET, "/api/v1/auth/me"],
      [routes.projects.GET, "/api/v1/projects"],
      [routes.settings.GET, "/api/v1/settings"],
      [routes.activity.GET, "/api/v1/activity"],
      [routes.audit.GET, "/api/v1/audit"],
      [routes.stream.GET, "/api/v1/events/stream"],
    ] as const) {
      const response = await call(handler as RouteHandler, path)
      expect(response.status, path).toBe(401)
    }
  })
})

describe("errors", () => {
  it("31. never return stack traces or internals", async () => {
    const response = await call(bootstrap, "/api/v1/auth/bootstrap", { method: "POST", rawBody: "{not json", headers: { "content-type": "application/json" } })
    const text = await response.text()
    expect(response.status).toBe(400)
    expect(text).not.toMatch(/stack|at \w+ \(|\.ts:|node_modules|SELECT|syntax error/i)
  })

  it("32. carry the request ID in the body and the X-Request-ID header", async () => {
    const response = await signIn("nobody", "nothing at all")
    const header = response.headers.get("x-request-id")
    expect(header).toMatch(/^[0-9a-f-]{36}$/)
    const body = await json<{ error: { requestId: string } }>(response)
    expect(body.error.requestId).toBe(header)
    // Successful responses carry it too, and are never cached.
    const ok = await call(routes.status.GET as RouteHandler, "/api/v1/auth/status")
    expect(ok.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/)
    expect(ok.headers.get("cache-control")).toBe("no-store")
  })

  it("refuses the API outright in mock mode", async () => {
    process.env.ARCELLITE_PROVIDER = "mock"
    try {
      const response = await call(routes.status.GET as RouteHandler, "/api/v1/auth/status")
      expect(response.status).toBe(501)
      expect((await json<{ error: { code: string } }>(response)).error.code).toBe("FEATURE_NOT_AVAILABLE")
    } finally {
      process.env.ARCELLITE_PROVIDER = "server"
    }
  })
})

describe("configuration", () => {
  it("refuses every API call while the master key is invalid", async () => {
    const key = process.env.ARCELLITE_MASTER_KEY
    process.env.ARCELLITE_MASTER_KEY = "a weak passphrase"
    try {
      const response = await call(routes.status.GET as RouteHandler, "/api/v1/auth/status")
      expect(response.status).toBe(503)
      const body = await json<{ error: { code: string; message: string } }>(response)
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE")
      expect(body.error.message).not.toContain("ARCELLITE_MASTER_KEY")
    } finally {
      process.env.ARCELLITE_MASTER_KEY = key
    }
  })
})
