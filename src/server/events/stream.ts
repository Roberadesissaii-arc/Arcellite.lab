import "server-only"
import type { EventDTO } from "@/lib/api/contracts/event"
import { resolveSession, type SessionContext } from "@/server/auth/session"
import { db } from "@/server/db/client"
import { log } from "@/server/security/log"
import { subscribe } from "./hub"
import { eventsAfter, latestSeq, replayBounds } from "./read"

/** Replay at most this many missed events; beyond it the client refetches everything. */
export const REPLAY_LIMIT = 500
export const HEARTBEAT_MS = 15_000
export const SESSION_CHECK_MS = 60_000
/** Open streams allowed per session in this process. */
export const MAX_STREAMS_PER_SESSION = 5

const openStreams = new Map<string, number>()

export interface StreamOptions {
  session: SessionContext
  sessionToken: string
  lastEventId: string | null
  signal: AbortSignal
  heartbeatMs?: number
  sessionCheckMs?: number
}

/** Last-Event-ID is our own seq: digits only, and small enough to be a safe integer. */
export function parseCursor(value: string | null): number | null {
  if (!value || !/^\d{1,15}$/.test(value)) return null
  return Number(value)
}

export function tooManyStreams(sessionId: string): boolean {
  return (openStreams.get(sessionId) ?? 0) >= MAX_STREAMS_PER_SESSION
}

function frame(event: EventDTO): string {
  return `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`
}

function named(name: string, id: number | null, data: Record<string, unknown>): string {
  return `${id === null ? "" : `id: ${id}\n`}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * The workspace change feed as Server-Sent Events. Every event is read from the events table
 * for the session's workspace only; NOTIFY merely says when to look. On reconnect the
 * client's Last-Event-ID is replayed (bounded), or a `resync` event tells it to refetch.
 * The stream ends when the session is revoked, idles out, or reaches its absolute expiry.
 */
export function eventStream(options: StreamOptions): ReadableStream<Uint8Array> {
  const { session, sessionToken, signal } = options
  const encoder = new TextEncoder()
  const workspaceId = session.workspaceId
  let cursor = 0
  let closed = false
  let draining = false
  let pending = false
  const cleanups: (() => void)[] = []

  /** Runs once, whether the server closes the stream or the client goes away. */
  function release() {
    if (closed) return false
    closed = true
    for (const cleanup of cleanups) cleanup()
    const count = (openStreams.get(session.sessionId) ?? 1) - 1
    if (count > 0) openStreams.set(session.sessionId, count)
    else openStreams.delete(session.sessionId)
    return true
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      openStreams.set(session.sessionId, (openStreams.get(session.sessionId) ?? 0) + 1)
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text))
      }
      const close = () => {
        if (!release()) return
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }

      async function drain() {
        if (draining) {
          pending = true
          return
        }
        draining = true
        try {
          do {
            pending = false
            let batch: EventDTO[]
            do {
              batch = await eventsAfter(db(), workspaceId, cursor, REPLAY_LIMIT)
              for (const event of batch) {
                send(frame(event))
                cursor = event.seq
              }
            } while (batch.length === REPLAY_LIMIT && !closed)
          } while (pending && !closed)
        } catch (error) {
          log("warn", "events.stream_read_failed", { error: error instanceof Error ? error.name : typeof error })
        } finally {
          draining = false
        }
      }

      signal.addEventListener("abort", close)
      cleanups.push(() => signal.removeEventListener("abort", close))

      try {
        send("retry: 3000\n\n")
        const requested = parseCursor(options.lastEventId)
        const latest = await latestSeq(db(), workspaceId)
        if (requested === null) {
          cursor = latest
          send(named("ready", latest, { seq: latest }))
        } else {
          const bounds = await replayBounds(db())
          const missed = requested < bounds.floor || requested > bounds.ceiling ? Infinity : (await eventsAfter(db(), workspaceId, requested, REPLAY_LIMIT + 1)).length
          if (missed > REPLAY_LIMIT) {
            cursor = latest
            send(named("resync", latest, { seq: latest }))
          } else {
            cursor = requested
            await drain()
          }
        }
      } catch (error) {
        log("warn", "events.stream_start_failed", { error: error instanceof Error ? error.name : typeof error })
        close()
        return
      }

      if (closed) return
      cleanups.push(subscribe(workspaceId, () => void drain()))

      const heartbeat = setInterval(() => {
        send(": heartbeat\n\n")
        // Backstop for a lost notification: look anyway.
        void drain()
      }, options.heartbeatMs ?? HEARTBEAT_MS)
      cleanups.push(() => clearInterval(heartbeat))

      const expire = () => {
        send(named("session-expired", null, {}))
        close()
      }
      const absolute = setTimeout(expire, Math.max(0, session.expiresAt.getTime() - Date.now()))
      cleanups.push(() => clearTimeout(absolute))
      const recheck = setInterval(async () => {
        try {
          const live = await resolveSession(db(), sessionToken)
          if (!live || live.workspaceId !== workspaceId) expire()
        } catch {
          // A database blip is not an expired session; the next check decides.
        }
      }, options.sessionCheckMs ?? SESSION_CHECK_MS)
      cleanups.push(() => clearInterval(recheck))
    },
    cancel() {
      release()
    },
  })
}
