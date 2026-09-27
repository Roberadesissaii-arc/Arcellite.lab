import { checkReadiness } from "@/server/services/health"

/** Readiness: dependencies are usable. Reports only pass/fail, never versions or reasons. */
export async function GET() {
  const ready = await checkReadiness()
  return Response.json({ status: ready ? "ready" : "unavailable" }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } })
}
