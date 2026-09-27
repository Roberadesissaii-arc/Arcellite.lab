import { sql } from "drizzle-orm"
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { createdAt, instant, updatedAt } from "./common"
import { users, workspaces } from "./identity"

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    environment: text("environment").notNull(),
    framework: text("framework").notNull(),
    branch: text("branch"),
    autoDeploy: boolean("auto_deploy").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Soft delete: archived projects keep their history and audit trail. */
    archivedAt: instant("archived_at"),
    /** Incremented on every update, for optimistic concurrency later. */
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("projects_workspace_slug_active_key").on(table.workspaceId, table.slug).where(sql`${table.archivedAt} is null`),
    index("projects_workspace_id_idx").on(table.workspaceId),
  ],
)

/** Where the code comes from. Safe metadata only: nothing here is fetched yet, and no credentials. */
export const projectSources = pgTable("project_sources", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string | number>>().notNull(),
})

export const projectBuildConfigs = pgTable("project_build_configs", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  rootDirectory: text("root_directory").notNull().default("."),
  packageManager: text("package_manager"),
  installCommand: text("install_command").notNull().default(""),
  buildCommand: text("build_command").notNull().default(""),
  startCommand: text("start_command").notNull().default(""),
  outputDirectory: text("output_directory"),
})

export const projectRuntimeConfigs = pgTable("project_runtime_configs", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  internalPort: integer("internal_port").notNull(),
  exposedPort: integer("exposed_port").notNull(),
  portMode: text("port_mode").notNull().default("auto"),
  healthPath: text("health_path").notNull().default("/"),
  restartPolicy: text("restart_policy").notNull().default("unless-stopped"),
  cpuLimit: doublePrecision("cpu_limit"),
  memoryLimitMb: integer("memory_limit_mb"),
})

/**
 * Every value is encrypted (AES-256-GCM), secret or not: the `secret` flag controls whether
 * the browser may read it back, not whether it is protected at rest.
 */
export const environmentVariables = pgTable(
  "environment_variables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    scope: text("scope").notNull().default("all"),
    secret: boolean("secret").notNull().default(false),
    valueCiphertext: text("value_ciphertext").notNull(),
    valueNonce: text("value_nonce").notNull(),
    valueTag: text("value_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("environment_variables_project_key_scope_key").on(table.projectId, table.key, table.scope)],
)
