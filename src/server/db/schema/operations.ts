import { sql } from "drizzle-orm"
import { bigserial, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { createdAt, instant, updatedAt } from "./common"
import { users, workspaces } from "./identity"

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "canceled"] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for system housekeeping jobs. */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: instant("run_after").notNull().defaultNow(),
    lockedBy: text("locked_by"),
    lockedAt: instant("locked_at"),
    /** A running job whose lease expired is claimable again (its worker died). */
    leaseExpiresAt: instant("lease_expires_at"),
    timeoutSeconds: integer("timeout_seconds").notNull().default(300),
    cancellationRequestedAt: instant("cancellation_requested_at"),
    idempotencyKey: text("idempotency_key"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestId: text("request_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: instant("completed_at"),
  },
  (table) => [
    index("jobs_claim_idx").on(table.status, table.runAfter),
    index("jobs_workspace_id_idx").on(table.workspaceId),
    check("jobs_status_check", sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'canceled')`),
  ],
)

export const jobAttempts = pgTable(
  "job_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    workerId: text("worker_id").notNull(),
    startedAt: instant("started_at").notNull().defaultNow(),
    finishedAt: instant("finished_at"),
    outcome: text("outcome"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (table) => [index("job_attempts_job_id_idx").on(table.jobId)],
)

/**
 * Durable, ordered change feed. `seq` is the SSE event id; a reconnecting client replays
 * everything after its Last-Event-ID. NOTIFY only wakes listeners — this table is the truth.
 */
export const events = pgTable(
  "events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    id: uuid("id").notNull().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("events_id_key").on(table.id), index("events_workspace_seq_idx").on(table.workspaceId, table.seq)],
)

/**
 * One row per (workspace, operation, key). The row is inserted in the same transaction as
 * the operation it guards, so a concurrent duplicate waits on the unique index and then
 * reads the committed response instead of repeating the effect.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
  },
  (table) => [uniqueIndex("idempotency_keys_scope_key").on(table.workspaceId, table.operation, table.key)],
)

/** Fixed-window counters for login throttling and secret reveal. Shared by every process. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: instant("window_started_at").notNull().defaultNow(),
  count: integer("count").notNull().default(0),
  updatedAt: updatedAt(),
})
