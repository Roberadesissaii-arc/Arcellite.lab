import type { DeploymentStatus } from "./types"

/** True once a deployment can no longer change: a pure reading of the status, safe for any provider. */
export function isTerminalStatus(status: DeploymentStatus): boolean {
  return status === "ready" || status === "failed" || status === "canceled" || status === "stopped"
}
