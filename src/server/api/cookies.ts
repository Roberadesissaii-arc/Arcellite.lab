import "server-only"
import { secureCookies } from "@/server/config"

export const SESSION_COOKIE = "arcellite_session"
export const CSRF_COOKIE = "arcellite_csrf"

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim()
      try {
        return decodeURIComponent(value)
      } catch {
        return null
      }
    }
  }
  return null
}

interface CookieOptions {
  httpOnly: boolean
  maxAgeSeconds: number
}

function serialize(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax", `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`]
  if (options.httpOnly) parts.push("HttpOnly")
  if (secureCookies()) parts.push("Secure")
  return parts.join("; ")
}

/**
 * The session token is HttpOnly: scripts never see it. The CSRF token is readable by the
 * app's own scripts so they can echo it in the X-CSRF-Token header.
 */
export function sessionCookies(sessionToken: string, csrfToken: string, maxAgeSeconds: number): string[] {
  return [
    serialize(SESSION_COOKIE, sessionToken, { httpOnly: true, maxAgeSeconds }),
    serialize(CSRF_COOKIE, csrfToken, { httpOnly: false, maxAgeSeconds }),
  ]
}

export function clearedSessionCookies(): string[] {
  return [serialize(SESSION_COOKIE, "", { httpOnly: true, maxAgeSeconds: 0 }), serialize(CSRF_COOKIE, "", { httpOnly: false, maxAgeSeconds: 0 })]
}
