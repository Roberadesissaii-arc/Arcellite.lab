import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SESSION_COOKIE } from "@/server/api/cookies"
import { resolveSession, type SessionContext } from "@/server/auth/session"
import { providerMode } from "@/server/config"
import { db } from "@/server/db/client"
import { isSetupRequired } from "@/server/services/auth"

/**
 * Server-side page protection. In server mode a page without a live session never renders:
 * the visitor is sent to /setup (no owner yet) or /login. Mock mode is untouched.
 */
export async function requirePageSession(): Promise<SessionContext | null> {
  if (providerMode() !== "server") return null
  if (await isSetupRequired()) redirect("/setup")
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null
  const session = await resolveSession(db(), token)
  if (!session) redirect("/login")
  return session
}

/** For /setup and /login: where to send someone who should not be on the page. */
export async function authPageRedirect(page: "setup" | "login"): Promise<string | null> {
  if (providerMode() !== "server") return "/"
  const setupRequired = await isSetupRequired()
  if (page === "login" && setupRequired) return "/setup"
  if (page === "setup" && !setupRequired) return "/login"
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null
  if (!setupRequired && (await resolveSession(db(), token))) return "/"
  return null
}
