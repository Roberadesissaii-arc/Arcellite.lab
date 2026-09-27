import "server-only"
import { ConfigError, databaseUrl, masterKeyring, providerMode } from "@/server/config"
import { log } from "@/server/security/log"

/**
 * Validates server-mode configuration at startup so an administrator sees a clear message
 * immediately, instead of on the first request. The server keeps running: API routes answer
 * SERVICE_UNAVAILABLE and /api/health/ready reports "unavailable" until it is fixed. Nothing
 * is derived or defaulted: a bad key is never replaced by a weaker one.
 */
export function validateStartup(): boolean {
  try {
    if (providerMode() !== "server") return true
    databaseUrl()
    masterKeyring()
    log("info", "startup.ok", { provider: "server" })
    return true
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    log("error", "startup.config_invalid", { reason: error.message })
    return false
  }
}
