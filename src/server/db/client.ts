import "server-only"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { databaseUrl } from "@/server/config"
import * as schema from "./schema"

export type Database = NodePgDatabase<typeof schema>
/** A transaction handle; services accept this so callers can compose them atomically. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type Executor = Database | Tx

interface DbState {
  pool: Pool
  db: Database
}

// One pool per process. Next.js dev reloads modules, so the pool lives on globalThis.
const holder = globalThis as typeof globalThis & { __arcelliteDb?: DbState }

function create(): DbState {
  const pool = new Pool({ connectionString: databaseUrl(), max: Number(process.env.ARCELLITE_DB_POOL_MAX ?? 10) })
  // An idle client losing its connection must not crash the process.
  pool.on("error", () => {})
  return { pool, db: drizzle(pool, { schema }) }
}

export function db(): Database {
  holder.__arcelliteDb ??= create()
  return holder.__arcelliteDb.db
}

export function pool(): Pool {
  holder.__arcelliteDb ??= create()
  return holder.__arcelliteDb.pool
}

export async function closeDb(): Promise<void> {
  const state = holder.__arcelliteDb
  holder.__arcelliteDb = undefined
  await state?.pool.end()
}
