import "server-only"
import { Client } from "pg"
import { databaseUrl } from "@/server/config"
import { log } from "@/server/security/log"

export interface Listener {
  stop(): Promise<void>
}

/**
 * A dedicated connection that LISTENs on `channel` and reconnects with backoff when it
 * drops. `onReconnect` fires after every successful reconnect, because notifications sent
 * while disconnected are lost: callers re-read durable state then.
 */
export function listen(channel: string, onNotify: (payload: string) => void, onReconnect: () => void = () => {}): Listener {
  if (!/^[a-z_]+$/.test(channel)) throw new Error("Invalid channel name")
  let client: Client | null = null
  let stopped = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule() {
    if (stopped || timer) return
    const delay = Math.min(30_000, 500 * 2 ** attempt++)
    timer = setTimeout(() => {
      timer = null
      void connect(true)
    }, delay)
    timer.unref?.()
  }

  async function connect(isReconnect: boolean) {
    const next = new Client({ connectionString: databaseUrl() })
    next.on("notification", (message) => {
      if (message.channel === channel && message.payload) onNotify(message.payload)
    })
    next.on("error", (error) => {
      log("warn", "listener.error", { channel, error: error.name })
      void next.end().catch(() => {})
      if (client === next) client = null
      schedule()
    })
    try {
      await next.connect()
      await next.query(`LISTEN ${channel}`)
      if (stopped) {
        await next.end()
        return
      }
      client = next
      attempt = 0
      if (isReconnect) onReconnect()
    } catch (error) {
      log("warn", "listener.connect_failed", { channel, error: error instanceof Error ? error.name : typeof error })
      await next.end().catch(() => {})
      schedule()
    }
  }

  void connect(false)

  return {
    async stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      const current = client
      client = null
      await current?.end().catch(() => {})
    },
  }
}
