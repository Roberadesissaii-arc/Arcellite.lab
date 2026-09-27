import "server-only"
import { sql } from "drizzle-orm"
import { masterKeyring, providerMode } from "@/server/config"
import { db } from "@/server/db/client"
import { log } from "@/server/security/log"

/** Mock mode has no dependencies. Server mode needs a valid key and a reachable database. */
export async function checkReadiness(): Promise<boolean> {
  try {
    if (providerMode() === "mock") return true
    masterKeyring()
    await db().execute(sql`select 1`)
    return true
  } catch (error) {
    log("warn", "health.not_ready", { error: error instanceof Error ? error.name : typeof error })
    return false
  }
}
