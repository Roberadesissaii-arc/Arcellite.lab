import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core"
import { createdAt } from "./common"
import { users, workspaces } from "./identity"

/** Human-readable operational history shown in the Activity feed. */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    result: text("result").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id"),
    objectName: text("object_name").notNull(),
    href: text("href"),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (table) => [index("activity_events_workspace_created_idx").on(table.workspaceId, table.createdAt)],
)

/**
 * Security audit trail. Append-only from the application's point of view: nothing updates
 * or deletes these rows. Metadata is sanitized before insert and never holds secrets.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").notNull(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    objectType: text("object_type"),
    objectId: text("object_id"),
    requestId: text("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("audit_log_workspace_created_idx").on(table.workspaceId, table.createdAt), index("audit_log_action_idx").on(table.action)],
)
