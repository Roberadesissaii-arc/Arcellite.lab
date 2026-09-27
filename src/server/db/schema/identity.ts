import { sql } from "drizzle-orm"
import { boolean, check, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { createdAt, instant, updatedAt } from "./common"

export const WORKSPACE_ROLES = ["owner", "admin", "developer", "viewer"] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What the person typed at setup: an email address or a username. */
    login: text("login").notNull(),
    /** Lowercased, NFKC-normalized `login`; the identity used for sign-in. */
    loginNormalized: text("login_normalized").notNull(),
    displayName: text("display_name").notNull(),
    /** Argon2id PHC string. Never a plaintext password. */
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    disabledAt: instant("disabled_at"),
  },
  (table) => [uniqueIndex("users_login_normalized_key").on(table.loginNormalized)],
)

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the session token. The token itself only lives in the browser cookie. */
    tokenHash: text("token_hash").notNull(),
    /** SHA-256 of the CSRF token issued with this session. */
    csrfTokenHash: text("csrf_token_hash").notNull(),
    createdAt: createdAt(),
    lastSeenAt: instant("last_seen_at").notNull().defaultNow(),
    /** Absolute lifetime; never extended. */
    expiresAt: instant("expires_at").notNull(),
    revokedAt: instant("revoked_at"),
  },
  (table) => [uniqueIndex("sessions_token_hash_key").on(table.tokenHash), index("sessions_user_id_idx").on(table.userId)],
)

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("workspaces_slug_key").on(table.slug)],
)

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_id_idx").on(table.userId),
    check("workspace_members_role_check", sql`${table.role} in ('owner', 'admin', 'developer', 'viewer')`),
  ],
)

/** Deployment defaults and workspace-wide policy. */
export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  defaultBranch: text("default_branch").notNull().default("main"),
  defaultEnvironment: text("default_environment").notNull().default("production"),
  portAllocation: text("port_allocation").notNull().default("auto"),
  portStart: integer("port_start").notNull().default(8082),
  buildConcurrency: integer("build_concurrency").notNull().default(1),
  logRetentionDays: integer("log_retention_days").notNull().default(14),
  autoRollback: boolean("auto_rollback").notNull().default(true),
  updatedAt: updatedAt(),
})

/** Per-person preferences that follow the account, not the browser. */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("UTC"),
  notifyDeploySuccess: boolean("notify_deploy_success").notNull().default(true),
  notifyDeployFailure: boolean("notify_deploy_failure").notNull().default(true),
  notifyDomains: boolean("notify_domains").notNull().default(true),
  notifyServer: boolean("notify_server").notNull().default(true),
  updatedAt: updatedAt(),
})
