import { hostname } from "node:os"
import { randomUUID } from "node:crypto"
import { providerMode } from "@/server/config"
import { closeDb } from "@/server/db/client"
import { listen } from "@/server/events/listener"
import { JOBS_CHANNEL } from "@/server/jobs/queue"
import { runOnce, scheduleHousekeeping } from "@/server/jobs/worker"
import { log } from "@/server/security/log"

/*
 * The Arcellite job worker: `pnpm worker`. It runs control-plane housekeeping and no-op jobs
 * only. It never touches Docker, a shell, or the network beyond PostgreSQL.
 */

const POLL_MS = 5_000
const HOUSEKEEPING_INTERVAL_SECONDS = 60 * 60

async function main() {
  if (providerMode() !== "server") {
    log("error", "worker.wrong_mode", { message: "Set ARCELLITE_PROVIDER=server to run the worker." })
    process.exitCode = 1
    return
  }
  const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
  let stopping = false
  let wake: (() => void) | null = null
  const nudge = () => {
    wake?.()
    wake = null
  }
  const listener = listen(JOBS_CHANNEL, nudge, nudge)

  const stop = () => {
    if (stopping) return
    log("info", "worker.stopping", { workerId })
    stopping = true
    nudge()
  }
  process.on("SIGTERM", stop)
  process.on("SIGINT", stop)

  log("info", "worker.started", { workerId })
  let lastSchedule = 0
  while (!stopping) {
    try {
      if (Date.now() - lastSchedule > 60_000) {
        lastSchedule = Date.now()
        await scheduleHousekeeping(HOUSEKEEPING_INTERVAL_SECONDS)
      }
      const { outcome, job } = await runOnce(workerId)
      if (job) log("info", "job.finished", { jobId: job.id, type: job.type, outcome })
      if (outcome !== "idle") continue
    } catch (error) {
      log("error", "worker.loop_failed", { error: error instanceof Error ? error.name : typeof error })
    }
    // Sleep until NOTIFY, the poll interval, or shutdown, whichever comes first.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_MS)
      wake = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }
  await listener.stop()
  await closeDb()
  log("info", "worker.stopped", { workerId })
}

main().catch((error: unknown) => {
  log("error", "worker.crashed", { error: error instanceof Error ? error.name : typeof error })
  process.exit(1)
})
