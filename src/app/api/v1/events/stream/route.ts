import { readCookie, SESSION_COOKIE } from "@/server/api/cookies"
import { ApiFailure } from "@/server/api/failure"
import { sessionRoute } from "@/server/api/handler"
import { requireCapability } from "@/server/auth/authorize"
import { eventStream, tooManyStreams } from "@/server/events/stream"

export const dynamic = "force-dynamic"

export const GET = sessionRoute(async ({ request, session, actor }) => {
  await requireCapability(actor, "read_project")
  if (tooManyStreams(session.sessionId)) throw new ApiFailure("RATE_LIMITED", "Too many open event streams for this session.")
  const url = new URL(request.url)
  const stream = eventStream({
    session,
    sessionToken: readCookie(request.headers.get("cookie"), SESSION_COOKIE) ?? "",
    // EventSource sends Last-Event-ID itself on reconnect; the query form covers a fresh page load.
    lastEventId: request.headers.get("last-event-id") ?? url.searchParams.get("lastEventId"),
    signal: request.signal,
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
})
