import { randomBytes } from "node:crypto"
import { afterAll } from "vitest"
import { closeDb } from "@/server/db/client"
import { stopHub } from "@/server/events/hub"
import { testDatabaseUrl } from "./database-url"

process.env.ARCELLITE_PROVIDER = "server"
process.env.DATABASE_URL = testDatabaseUrl()
// A throwaway key per run unless CI provides one. Never a real key.
process.env.ARCELLITE_MASTER_KEY ??= randomBytes(32).toString("base64")
process.env.ARCELLITE_LOG_SILENT = "true"
delete process.env.ARCELLITE_APP_URL
delete process.env.ARCELLITE_TRUSTED_ORIGINS

afterAll(async () => {
  await stopHub()
  await closeDb()
})
