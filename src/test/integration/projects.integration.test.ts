import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/server/db/client"
import { activityEvents, auditLog, environmentVariables, events, idempotencyKeys, projects, users } from "@/server/db/schema"
import { addMember, Browser, bootstrapOwner, createProject, json, projectBody, resetDatabase, routes, type RouteHandler } from "./harness"

let owner: Browser
beforeEach(async () => {
  await resetDatabase()
  owner = await bootstrapOwner()
})

const list = (who: Browser) => who.call(routes.projects.GET as RouteHandler, "/api/v1/projects").then((response) => json<{ id: string; name: string }[]>(response))

describe("projects", () => {
  it("creates, reads, updates, and archives with activity, audit, and events", async () => {
    const created = await createProject(owner, { name: "Shop" })
    expect(created.status).toBe(201)
    const project = await json<{ id: string; slug: string; runtimeState: string; activeDeploymentId: null; createdAt: string }>(created)
    expect(project).toMatchObject({ slug: "shop", runtimeState: "not-deployed", activeDeploymentId: null })
    expect(project.createdAt).toMatch(/Z$/)

    const params = { projectId: project.id }
    const updated = await owner.call(routes.project.PATCH as RouteHandler, `/api/v1/projects/${project.id}`, { method: "PATCH", params, body: { name: "Shop 2", buildCommand: "pnpm build:prod" } })
    expect(await json(updated)).toMatchObject({ name: "Shop 2", buildCommand: "pnpm build:prod" })

    const archived = await owner.call(routes.project.DELETE as RouteHandler, `/api/v1/projects/${project.id}`, { method: "DELETE", params })
    expect(archived.status).toBe(204)
    expect(await list(owner)).toEqual([])
    const missing = await owner.call(routes.project.GET as RouteHandler, `/api/v1/projects/${project.id}`, { params })
    expect(missing.status).toBe(404)

    // Soft delete: the row, and its history, remain.
    const [row] = await db().select().from(projects)
    expect(row.archivedAt).not.toBeNull()
    const audit = (await db().select().from(auditLog)).map((entry) => entry.action)
    expect(audit).toEqual(expect.arrayContaining(["project.create", "project.update", "project.archive"]))
    const activity = (await db().select().from(activityEvents)).map((entry) => entry.action)
    expect(activity).toEqual(expect.arrayContaining(["Project created", "Project settings updated", "Project archived"]))
    const types = (await db().select().from(events).orderBy(events.seq)).map((event) => event.type)
    expect(types).toEqual(["project.created", "project.updated", "project.archived"])
  })

  it("lets an archived project's slug and port be reused", async () => {
    const first = await json<{ id: string }>(await createProject(owner, { name: "Api", exposedPort: 9500 }))
    await owner.call(routes.project.DELETE as RouteHandler, `/api/v1/projects/${first.id}`, { method: "DELETE", params: { projectId: first.id } })
    const again = await json<{ slug: string }>(await createProject(owner, { name: "Api", exposedPort: 9500 }))
    expect(again.slug).toBe("api")
  })

  it("gives duplicate names distinct slugs and refuses a taken port", async () => {
    await createProject(owner, { name: "Api", exposedPort: 9600 })
    const second = await json<{ slug: string }>(await createProject(owner, { name: "Api", exposedPort: 9601 }))
    expect(second.slug).toBe("api-2")
    const clash = await createProject(owner, { name: "Other", exposedPort: 9600 })
    expect(clash.status).toBe(409)
    expect((await json<{ error: { code: string } }>(clash)).error.code).toBe("PORT_CONFLICT")
  })

  it("validates sources: https Git URLs only, no credentials", async () => {
    for (const url of ["http://github.com/a/b.git", "https://user:pass@github.com/a/b.git", "file:///etc/passwd", "git@github.com:a/b.git"]) {
      const response = await createProject(owner, { source: { type: "git", url } })
      expect(response.status, url).toBe(400)
    }
    const traversal = await createProject(owner, { rootDirectory: "../../etc" })
    expect(traversal.status).toBe(400)
    const unknown = await createProject(owner, { extra: true })
    expect(unknown.status).toBe(400)
  })

  it("creates a project and its first variables atomically", async () => {
    const good = await createProject(owner, { env: [{ key: "A", value: "1", secret: false, scope: "all" }] })
    expect(good.status).toBe(201)
    expect(await db().select().from(environmentVariables)).toHaveLength(1)
    // A duplicate variable fails the whole create: no project, no events, no audit.
    const before = await db().select().from(events)
    const bad = await createProject(owner, {
      name: "Rolled back",
      env: [
        { key: "DUP", value: "1", secret: true, scope: "all" },
        { key: "DUP", value: "2", secret: true, scope: "all" },
      ],
    })
    expect(bad.status).toBe(409)
    expect((await list(owner)).map((project) => project.name)).not.toContain("Rolled back")
    expect(await db().select().from(events)).toHaveLength(before.length)
    expect(await db().select().from(environmentVariables)).toHaveLength(1)
  })
})

describe("durable idempotency", () => {
  it("26. repeated and concurrent creates with one key make one project", async () => {
    const headers = { "idempotency-key": "create-shop-1" }
    const body = projectBody({ name: "Shop", exposedPort: 9700 })
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => owner.call(routes.projects.POST as RouteHandler, "/api/v1/projects", { method: "POST", body, headers })),
    )
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201])
    const ids = new Set(await Promise.all(responses.map((response) => json<{ id: string }>(response).then((project) => project.id))))
    expect(ids.size).toBe(1)
    expect(responses.filter((response) => response.headers.get("idempotent-replayed") === "true")).toHaveLength(4)
    expect(await db().select().from(projects)).toHaveLength(1)
    // The key survives in PostgreSQL, not in process memory.
    const [key] = await db().select().from(idempotencyKeys)
    expect(key).toMatchObject({ operation: "project.create", key: "create-shop-1", responseStatus: 201 })
    expect(key.requestHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("27. rejects the same key with a different payload", async () => {
    const headers = { "idempotency-key": "create-2" }
    await createProject(owner, { name: "One", exposedPort: 9710 }, headers)
    const conflict = await createProject(owner, { name: "Two", exposedPort: 9711 }, headers)
    expect(conflict.status).toBe(409)
    expect((await json<{ error: { code: string } }>(conflict)).error.code).toBe("IDEMPOTENCY_CONFLICT")
    expect(await db().select().from(projects)).toHaveLength(1)
  })

  it("does not remember failed attempts, and scopes keys per workspace and operation", async () => {
    const headers = { "idempotency-key": "retry-me" }
    await createProject(owner, { name: "Taken", exposedPort: 9720 })
    const failed = await createProject(owner, { name: "Retry", exposedPort: 9720 }, headers)
    expect(failed.status).toBe(409)
    expect(await db().select().from(idempotencyKeys)).toHaveLength(0)
    const other = await addMember("owner", "other@example.com", { workspaceName: "Other Lab" })
    expect((await createProject(other, { name: "Theirs", exposedPort: 9721 }, headers)).status).toBe(201)
    expect((await createProject(owner, { name: "Mine", exposedPort: 9722 }, headers)).status).toBe(201)
  })

  it("rejects malformed keys", async () => {
    const response = await createProject(owner, {}, { "idempotency-key": "has spaces" })
    expect(response.status).toBe(400)
  })

  it("expires keys after their TTL", async () => {
    const headers = { "idempotency-key": "old" }
    await createProject(owner, { name: "First", exposedPort: 9730 }, headers)
    await db().update(idempotencyKeys).set({ expiresAt: sql`now() - interval '1 minute'` })
    const second = await createProject(owner, { name: "Second", exposedPort: 9731 }, headers)
    expect(second.status).toBe(201)
    expect(second.headers.get("idempotent-replayed")).toBeNull()
  })
})

describe("authorization", () => {
  it("viewers read but cannot change anything", async () => {
    await createProject(owner, { name: "Visible" })
    const viewer = await addMember("viewer", "viewer@example.com")
    expect((await list(viewer)).map((project) => project.name)).toEqual(["Visible"])
    const denied = await createProject(viewer, { name: "Nope" })
    expect(denied.status).toBe(403)
    expect((await json<{ error: { code: string } }>(denied)).error.code).toBe("FORBIDDEN")
    expect((await viewer.call(routes.audit.GET as RouteHandler, "/api/v1/audit")).status).toBe(403)
    expect((await viewer.call(routes.settings.PATCH as RouteHandler, "/api/v1/settings", { method: "PATCH", body: { workspaceName: "Mine" } })).status).toBe(403)
  })

  it("developers manage projects but not the workspace or the audit log", async () => {
    const developer = await addMember("developer", "dev@example.com")
    expect((await createProject(developer, { name: "Dev app" })).status).toBe(201)
    expect((await developer.call(routes.settings.PATCH as RouteHandler, "/api/v1/settings", { method: "PATCH", body: { defaultBranch: "trunk" } })).status).toBe(403)
    // Personal preferences are always their own to change.
    expect((await developer.call(routes.settings.PATCH as RouteHandler, "/api/v1/settings", { method: "PATCH", body: { notifyServer: false } })).status).toBe(200)
    expect((await developer.call(routes.audit.GET as RouteHandler, "/api/v1/audit")).status).toBe(403)
  })

  it("isolates workspaces: another workspace's project is simply not found", async () => {
    const mine = await json<{ id: string }>(await createProject(owner, { name: "Private" }))
    const stranger = await addMember("owner", "stranger@example.com", { workspaceName: "Elsewhere" })
    expect(await list(stranger)).toEqual([])
    const params = { projectId: mine.id }
    expect((await stranger.call(routes.project.GET as RouteHandler, `/api/v1/projects/${mine.id}`, { params })).status).toBe(404)
    expect((await stranger.call(routes.project.DELETE as RouteHandler, `/api/v1/projects/${mine.id}`, { method: "DELETE", params })).status).toBe(404)
    expect((await stranger.call(routes.environment.GET as RouteHandler, `/api/v1/projects/${mine.id}/environment`, { params })).status).toBe(404)
  })
})

describe("settings, activity, and audit", () => {
  it("round-trips settings and records the change", async () => {
    const response = await owner.call(routes.settings.PATCH as RouteHandler, "/api/v1/settings", { method: "PATCH", body: { workspaceName: "Home Lab", defaultBranch: "trunk", displayName: "Ada L." } })
    expect(await json(response)).toMatchObject({ workspaceName: "Home Lab", defaultBranch: "trunk", displayName: "Ada L.", redactSecrets: true })
    const again = await json(await owner.call(routes.settings.GET as RouteHandler, "/api/v1/settings"))
    expect(again).toMatchObject({ workspaceName: "Home Lab" })
    const [user] = await db().select().from(users)
    expect(user.displayName).toBe("Ada L.")
    const activity = await json<{ action: string }[]>(await owner.call(routes.activity.GET as RouteHandler, "/api/v1/activity"))
    expect(activity.map((item) => item.action)).toContain("Settings updated")
    const audit = await json<{ action: string }[]>(await owner.call(routes.audit.GET as RouteHandler, "/api/v1/audit"))
    expect(audit.map((item) => item.action)).toEqual(expect.arrayContaining(["auth.bootstrap", "settings.update"]))
  })

  it("rejects unknown settings and client-side-only preferences", async () => {
    for (const body of [{ theme: "dark" }, { redactSecrets: false }, { unknown: 1 }]) {
      const response = await owner.call(routes.settings.PATCH as RouteHandler, "/api/v1/settings", { method: "PATCH", body })
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
  })

  it("keeps audit entries separate from activity and never deletes them with a project", async () => {
    const project = await json<{ id: string }>(await createProject(owner))
    await owner.call(routes.project.DELETE as RouteHandler, `/api/v1/projects/${project.id}`, { method: "DELETE", params: { projectId: project.id } })
    const rows = await db().select().from(auditLog).where(eq(auditLog.objectId, project.id))
    expect(rows.map((row) => row.action)).toEqual(expect.arrayContaining(["project.create", "project.archive"]))
  })
})
