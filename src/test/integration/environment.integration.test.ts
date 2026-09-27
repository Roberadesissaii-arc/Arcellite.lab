import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { createSecretBox } from "@/server/crypto/secret-box"
import { db } from "@/server/db/client"
import { activityEvents, auditLog, environmentVariables, events, idempotencyKeys } from "@/server/db/schema"
import { addMember, Browser, bootstrapOwner, call, createProject, json, OWNER, resetDatabase, routes, type RouteHandler } from "./harness"

const SECRET = "sk_live_do-not-leak-7f3a9c"
const PLAIN = "https://plain.example.com/visible"

let browser: Browser
let projectId: string

async function addVariable(key: string, value: string, secret: boolean, who = browser) {
  const response = await who.call(routes.environment.POST as RouteHandler, `/api/v1/projects/${projectId}/environment`, {
    method: "POST",
    params: { projectId },
    body: { key, value, secret, scope: "all" },
  })
  return response
}

function reveal(variableId: string, password: string, who = browser, csrf?: string | null) {
  return who.call(routes.reveal.POST as RouteHandler, `/api/v1/projects/${projectId}/environment/${variableId}/reveal`, {
    method: "POST",
    params: { projectId, variableId },
    body: { password },
    csrf,
  })
}

beforeEach(async () => {
  await resetDatabase()
  browser = await bootstrapOwner()
  projectId = (await json<{ id: string }>(await createProject(browser))).id
})

describe("environment encryption", () => {
  it("16. stores every value (secret or not) as AES-256-GCM ciphertext only", async () => {
    expect((await addVariable("API_TOKEN", SECRET, true)).status).toBe(201)
    expect((await addVariable("PUBLIC_URL", PLAIN, false)).status).toBe(201)
    const rows = await db().select().from(environmentVariables)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.keyVersion).toBe(1)
      expect(Buffer.from(row.valueNonce, "base64")).toHaveLength(12)
      expect(Buffer.from(row.valueTag, "base64")).toHaveLength(16)
    }
    const dump = JSON.stringify(await db().execute(sql`select * from environment_variables`))
    expect(dump).not.toContain(SECRET)
    expect(dump).not.toContain(PLAIN)
  })

  it("17. encrypts the same plaintext differently each time", async () => {
    await addVariable("A_TOKEN", SECRET, true)
    await addVariable("B_TOKEN", SECRET, true)
    const [a, b] = await db().select().from(environmentVariables)
    expect(a.valueCiphertext).not.toBe(b.valueCiphertext)
    expect(a.valueNonce).not.toBe(b.valueNonce)
  })

  it("18. cannot be decrypted with a different master key, or moved to another row", async () => {
    await addVariable("API_TOKEN", SECRET, true)
    const [row] = await db().select().from(environmentVariables)
    const sealed = { ciphertext: row.valueCiphertext, nonce: row.valueNonce, tag: row.valueTag, keyVersion: row.keyVersion }
    const aad = `arcellite:env:${projectId}:${row.id}`
    const right = createSecretBox({ current: 1, keys: new Map([[1, Buffer.from(process.env.ARCELLITE_MASTER_KEY!, "base64")]]) })
    expect(right.open(sealed, aad)).toBe(SECRET)
    const wrong = createSecretBox({ current: 1, keys: new Map([[1, Buffer.alloc(32, 7)]]) })
    expect(() => wrong.open(sealed, aad)).toThrow(/could not be decrypted/)
    expect(() => right.open(sealed, `arcellite:env:${projectId}:00000000-0000-4000-8000-000000000000`)).toThrow(/could not be decrypted/)
  })

  it("19. the project API never serializes environment values", async () => {
    await addVariable("API_TOKEN", SECRET, true)
    await addVariable("PUBLIC_URL", PLAIN, false)
    const list = await (await browser.call(routes.projects.GET as RouteHandler, "/api/v1/projects")).text()
    const one = await (await browser.call(routes.project.GET as RouteHandler, `/api/v1/projects/${projectId}`, { params: { projectId } })).text()
    for (const text of [list, one]) {
      expect(text).not.toContain(SECRET)
      expect(text).not.toContain("API_TOKEN")
    }
  })

  it("20. the environment list reports secrets as write-only", async () => {
    await addVariable("API_TOKEN", SECRET, true)
    await addVariable("PUBLIC_URL", PLAIN, false)
    const response = await browser.call(routes.environment.GET as RouteHandler, `/api/v1/projects/${projectId}/environment`, { params: { projectId } })
    const text = await response.text()
    expect(text).not.toContain(SECRET)
    const list = JSON.parse(text) as { key: string; secret: boolean; hasValue?: boolean; value?: string }[]
    expect(list.find((item) => item.key === "API_TOKEN")).toMatchObject({ secret: true, hasValue: true })
    expect(list.find((item) => item.key === "API_TOKEN")).not.toHaveProperty("value")
    expect(list.find((item) => item.key === "PUBLIC_URL")).toMatchObject({ secret: false, value: PLAIN })
  })

  it("the create response and idempotency records never carry the secret", async () => {
    const response = await browser.call(routes.environment.POST as RouteHandler, `/api/v1/projects/${projectId}/environment`, {
      method: "POST",
      params: { projectId },
      body: { key: "API_TOKEN", value: SECRET, secret: true, scope: "all" },
      headers: { "idempotency-key": "env-1" },
    })
    expect(await response.text()).not.toContain(SECRET)
    const stored = JSON.stringify(await db().select().from(idempotencyKeys))
    expect(stored).not.toContain(SECRET)
  })

  it("updates keep the stored value unless a new one is sent", async () => {
    const created = await json<{ id: string }>(await addVariable("API_TOKEN", SECRET, true))
    const path = `/api/v1/projects/${projectId}/environment/${created.id}`
    const params = { projectId, variableId: created.id }
    const renamed = await browser.call(routes.variable.PATCH as RouteHandler, path, { method: "PATCH", params, body: { key: "API_KEY" } })
    expect(renamed.status).toBe(200)
    expect(await json<{ value: string }>(await reveal(created.id, OWNER.password))).toMatchObject({ key: "API_KEY", value: SECRET })
    await browser.call(routes.variable.PATCH as RouteHandler, path, { method: "PATCH", params, body: { value: "rotated-value" } })
    expect(await json<{ value: string }>(await reveal(created.id, OWNER.password))).toMatchObject({ value: "rotated-value" })
    const removed = await browser.call(routes.variable.DELETE as RouteHandler, path, { method: "DELETE", params })
    expect(removed.status).toBe(204)
    expect(await db().select().from(environmentVariables)).toHaveLength(0)
  })

  it("rejects a duplicate key in the same scope", async () => {
    await addVariable("API_TOKEN", SECRET, true)
    const duplicate = await addVariable("API_TOKEN", "other", true)
    expect(duplicate.status).toBe(409)
  })
})

describe("secret reveal", () => {
  let variableId: string
  beforeEach(async () => {
    variableId = (await json<{ id: string }>(await addVariable("API_TOKEN", SECRET, true))).id
  })

  it("21. requires authentication", async () => {
    const response = await call(routes.reveal.POST as RouteHandler, `/api/v1/projects/${projectId}/environment/${variableId}/reveal`, {
      method: "POST",
      params: { projectId, variableId },
      body: { password: OWNER.password },
    })
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain(SECRET)
  })

  it("22. requires CSRF", async () => {
    const response = await reveal(variableId, OWNER.password, browser, null)
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain(SECRET)
  })

  it("23. requires the current password", async () => {
    const wrong = await reveal(variableId, "not my password")
    expect(wrong.status).toBe(403)
    expect(await wrong.text()).not.toContain(SECRET)
    const right = await reveal(variableId, OWNER.password)
    expect(right.status).toBe(200)
    expect(right.headers.get("cache-control")).toContain("no-store")
    expect(right.headers.get("pragma")).toBe("no-cache")
    expect(await json(right)).toEqual({ id: variableId, key: "API_TOKEN", value: SECRET })
  })

  it("24. writes an audit record for every attempt", async () => {
    await reveal(variableId, "not my password")
    await reveal(variableId, OWNER.password)
    const rows = await db().select().from(auditLog).where(eq(auditLog.action, "secret.reveal"))
    expect(rows.map((row) => row.outcome).sort()).toEqual(["failure", "success"])
    expect(rows.every((row) => row.objectId === variableId && row.requestId)).toBe(true)
  })

  it("25. keeps the plaintext out of audit, activity, events, and logs tables", async () => {
    await reveal(variableId, OWNER.password)
    for (const table of [auditLog, activityEvents, events, idempotencyKeys]) {
      const dump = JSON.stringify(await db().select().from(table))
      expect(dump).not.toContain(SECRET)
      expect(dump).not.toContain(OWNER.password)
    }
  })

  it("is rate limited per person", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) await reveal(variableId, "not my password")
    const limited = await reveal(variableId, OWNER.password)
    expect(limited.status).toBe(429)
  })

  it("is refused to roles without view_secret", async () => {
    const developer = await addMember("developer", "dev@example.com")
    const response = await reveal(variableId, "member password 123", developer)
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain(SECRET)
    const [denied] = await db().select().from(auditLog).where(eq(auditLog.action, "authorization.denied"))
    expect(denied.outcome).toBe("denied")
  })

  it("rejects a malformed or foreign variable ID as not found", async () => {
    expect((await reveal("not-a-uuid", OWNER.password)).status).toBe(404)
    expect((await reveal("00000000-0000-4000-8000-000000000000", OWNER.password)).status).toBe(404)
  })
})
