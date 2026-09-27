import "server-only"
import { trustedOrigins } from "@/server/config"

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Whether a state-changing request comes from a page we trust. Browsers always send
 * `Origin` on POST/PUT/PATCH/DELETE, so a missing Origin is refused.
 *
 * With ARCELLITE_APP_URL / ARCELLITE_TRUSTED_ORIGINS set, only those origins pass. With
 * neither set, only loopback origins pass, which covers local development without
 * trusting whatever Host a request claims. X-Forwarded-* headers are never consulted.
 */
export function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin || origin === "null") return false
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  const configured = trustedOrigins()
  if (configured.length) return configured.includes(parsed.origin)
  if (!LOOPBACK.has(parsed.hostname)) return false
  // The request must also be addressed to this loopback origin (blocks DNS rebinding).
  const host = request.headers.get("host")
  return host === parsed.host
}
