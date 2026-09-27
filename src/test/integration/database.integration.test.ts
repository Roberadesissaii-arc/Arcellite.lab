import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/server/db/client"
import { users, workspaceMembers, workspaces } from "@/server/db/schema"
import { bootstrapOwner, createProject, OWNER, resetDatabase } from "./harness"

beforeEach(resetDatabase)

describe("schema", () => {
  it("is created by the committed migrations", async () => {
    const applied = await db().execute<{ count: number }>(sql`select count(*)::int as count from drizzle.__drizzle_migrations`)
    expect(applied.rows[0].count).toBeGreaterThanOrEqual(1)
    const tables = await db().execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`)
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(["users", "sessions", "workspaces", "workspace_members", "projects", "environment_variables", "jobs", "job_attempts", "events", "idempotency_keys", "rate_limits", "activity_events", "audit_log"]),
    )
  })

  it("uses timestamptz for every timestamp and uuid primary keys", async () => {
    const columns = await db().execute<{ table_name: string; column_name: string; data_type: string }>(sql`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and (column_name like '%\\_at' or column_name = 'id')
    `)
    for (const column of columns.rows) {
      if (column.column_name === "id") expect(column.data_type, `${column.table_name}.id`).toBe("uuid")
      else expect(column.data_type, `${column.table_name}.${column.column_name}`).toBe("timestamp with time zone")
    }
  })

  it("enforces unique normalized logins", async () => {
    await db().insert(users).values({ login: "Ada", loginNormalized: "ada", displayName: "Ada", passwordHash: "x" })
    await expect(db().insert(users).values({ login: "ADA", loginNormalized: "ada", displayName: "Ada 2", passwordHash: "x" })).rejects.toThrow()
  })

  it("enforces the role check and one membership per workspace", async () => {
    const [user] = await db().insert(users).values({ login: "a", loginNormalized: "a", displayName: "A", passwordHash: "x" }).returning()
    const [workspace] = await db().insert(workspaces).values({ name: "W", slug: "w" }).returning()
    await expect(db().insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "root" as "owner" })).rejects.toThrow()
    await db().insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
    await expect(db().insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "viewer" })).rejects.toThrow()
  })

  it("rolls back every write in a failed transaction", async () => {
    await expect(
      db().transaction(async (tx) => {
        await tx.insert(workspaces).values({ name: "Temp", slug: "temp" })
        await tx.insert(workspaces).values({ name: "Temp again", slug: "temp" })
      }),
    ).rejects.toThrow()
    expect(await db().select().from(workspaces)).toHaveLength(0)
  })

  it("never stores the master key, passwords, or raw tokens in any table", async () => {
    const owner = await bootstrapOwner()
    await createProject(owner, { env: [{ key: "TOKEN", value: "plain-env-value-123", secret: true, scope: "all" }] })
    const tables = await db().execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public'`)
    const dumps: string[] = []
    for (const { table_name } of tables.rows) {
      const rows = await db().execute<{ j: string }>(sql.raw(`select row_to_json(t)::text as j from "${table_name}" t`))
      dumps.push(...rows.rows.map((row) => row.j))
    }
    const everything = dumps.join("\n")
    expect(everything.length).toBeGreaterThan(1000)
    for (const needle of [process.env.ARCELLITE_MASTER_KEY!, OWNER.password, owner.session, owner.csrf, "plain-env-value-123"]) {
      expect(everything).not.toContain(needle)
    }
  })
})
