import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"
import { testDatabaseUrl } from "./database-url"

/** Applies the committed migrations to the test database once per run. */
export default async function setup() {
  const pool = new Pool({ connectionString: testDatabaseUrl() })
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" })
  } finally {
    await pool.end()
  }
}
