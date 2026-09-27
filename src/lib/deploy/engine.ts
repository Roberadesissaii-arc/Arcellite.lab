import type {
  Deployment,
  DeploymentError,
  DeploymentPhase,
  DeploymentStatus,
  DeploymentStep,
  Project,
} from "./types"
import { isTerminalStatus } from "./status"

export { isTerminalStatus }

export interface PhaseDef {
  phase: Exclude<DeploymentPhase, "ready">
  label: string
  ms: number
  status: DeploymentStatus
  visible: boolean
}

export const PIPELINE: readonly PhaseDef[] = [
  { phase: "queued", label: "Queued", ms: 500, status: "queued", visible: false },
  { phase: "preparing", label: "Preparing source", ms: 1400, status: "preparing", visible: true },
  { phase: "installing", label: "Installing dependencies", ms: 2000, status: "building", visible: true },
  { phase: "building", label: "Building application", ms: 2400, status: "building", visible: true },
  { phase: "creating-image", label: "Creating image", ms: 1500, status: "deploying", visible: true },
  { phase: "starting", label: "Starting container", ms: 1200, status: "deploying", visible: true },
  { phase: "health-check", label: "Running health check", ms: 900, status: "deploying", visible: true },
] as const

export const FAIL_RATIO = 0.75

export function totalDurationMs(): number {
  return PIPELINE.reduce((sum, phase) => sum + phase.ms, 0)
}

export function isTerminal(dep: Deployment): boolean {
  return dep.finishedAt != null || isTerminalStatus(dep.status)
}

export function statusForPhase(phase: DeploymentPhase): DeploymentStatus {
  switch (phase) {
    case "queued":
      return "queued"
    case "preparing":
      return "preparing"
    case "installing":
    case "building":
      return "building"
    case "creating-image":
    case "starting":
    case "health-check":
      return "deploying"
    case "ready":
      return "ready"
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function phaseOffset(phase: PhaseDef["phase"]): number {
  let offset = 0
  for (const item of PIPELINE) {
    if (item.phase === phase) return offset
    offset += item.ms
  }
  return offset
}

function failure(dep: Deployment, phase: PhaseDef): DeploymentError {
  const command = phase.phase === "building" ? "the build command" : phase.label.toLowerCase()
  return {
    title: phase.phase === "building" ? "Build failed" : "Deployment failed",
    detail: `${phase.label} stopped. ${command[0].toUpperCase()}${command.slice(1)} exited with status 1.`,
    affects: dep.previousRelease
      ? "This release was not published. The previous release is still serving traffic."
      : "This release was not published. Nothing is serving the project yet.",
    action: "Review the build log, adjust the commands if needed, and redeploy.",
  }
}

function buildSteps(started: number, active: PhaseDef | null, failed: boolean, finishedAt: number | null): DeploymentStep[] {
  const visible = PIPELINE.filter((phase) => phase.visible)
  const steps: DeploymentStep[] = visible.map((phase) => {
    const start = started + phaseOffset(phase.phase)
    const end = start + phase.ms
    if (!active && finishedAt != null && !failed) {
      return {
        phase: phase.phase,
        label: phase.label,
        status: "completed",
        startedAt: iso(start),
        finishedAt: iso(end),
      }
    }
    if (!active) {
      return { phase: phase.phase, label: phase.label, status: "pending", startedAt: null, finishedAt: null }
    }
    const activeOffset = phaseOffset(active.phase)
    const thisOffset = phaseOffset(phase.phase)
    if (thisOffset < activeOffset) {
      return {
        phase: phase.phase,
        label: phase.label,
        status: "completed",
        startedAt: iso(start),
        finishedAt: iso(end),
      }
    }
    if (phase.phase === active.phase) {
      return {
        phase: phase.phase,
        label: phase.label,
        status: failed ? "failed" : "active",
        startedAt: iso(start),
        finishedAt: failed && finishedAt != null ? iso(finishedAt) : null,
      }
    }
    return { phase: phase.phase, label: phase.label, status: "pending", startedAt: null, finishedAt: null }
  })

  const readyStart = started + totalDurationMs()
  steps.push({
    phase: "ready",
    label: "Deployment ready",
    status: !active && finishedAt != null && !failed ? "completed" : "pending",
    startedAt: !active && finishedAt != null && !failed ? iso(readyStart) : null,
    finishedAt: !active && finishedAt != null && !failed ? iso(finishedAt) : null,
  })
  return steps
}

export function materializeDeployment(dep: Deployment, now: number): Deployment {
  if (dep.finishedAt || dep.status === "stopped" || dep.status === "canceled") return dep

  const started = Date.parse(dep.startedAt)
  if (Number.isNaN(started)) return dep

  let remaining = Math.max(0, now - started)
  let active: PhaseDef | null = null
  let activeElapsed = 0

  for (const phase of PIPELINE) {
    if (remaining < phase.ms) {
      active = phase
      activeElapsed = remaining
      break
    }
    remaining -= phase.ms
  }

  if (!active) {
    const finished = started + totalDurationMs()
    return {
      ...dep,
      status: "ready",
      phase: "ready",
      finishedAt: iso(finished),
      error: null,
      steps: buildSteps(started, null, false, finished),
    }
  }

  const failAt = dep.failAt
  if (failAt === active.phase && activeElapsed >= Math.floor(active.ms * FAIL_RATIO)) {
    const finished = started + phaseOffset(active.phase) + Math.floor(active.ms * FAIL_RATIO)
    return {
      ...dep,
      status: "failed",
      phase: active.phase,
      finishedAt: iso(finished),
      error: failure(dep, active),
      steps: buildSteps(started, active, true, finished),
    }
  }

  return {
    ...dep,
    status: active.status,
    phase: active.phase,
    finishedAt: null,
    error: null,
    steps: buildSteps(started, active, false, null),
  }
}

export function concludeDeployment(dep: Deployment): Deployment {
  const end = Date.parse(dep.startedAt) + totalDurationMs() + 20
  return materializeDeployment(dep, end)
}

export function cancelDeployment(dep: Deployment, now: number): Deployment {
  if (isTerminal(dep)) return dep
  const view = materializeDeployment(dep, now)
  return {
    ...view,
    status: "canceled",
    phase: view.phase,
    finishedAt: iso(now),
    error: {
      title: "Deployment canceled",
      detail: "The deployment was stopped before it published a release.",
      affects: dep.previousRelease
        ? "The previous release is still serving traffic."
        : "Nothing new was published for this project.",
      action: "Redeploy when you want to continue.",
    },
    steps: view.steps.map((step) =>
      step.status === "active" ? { ...step, status: "canceled", finishedAt: iso(now) } : step,
    ),
  }
}

export function deploymentFraction(dep: Deployment, now: number): number {
  const total = totalDurationMs()
  const started = Date.parse(dep.startedAt)
  if (Number.isNaN(started) || total <= 0) return 0
  if (dep.status === "failed" || dep.status === "canceled") {
    const end = dep.finishedAt ? Date.parse(dep.finishedAt) : now
    return clamp((end - started) / total)
  }
  if (dep.status === "ready" || dep.status === "stopped") return 1
  return clamp((now - started) / total)
}

function clamp(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function sourceLabel(project: Pick<Project, "source" | "branch">): string {
  const source = project.source
  switch (source.type) {
    case "github":
      return project.branch ? `${source.fullName} · ${project.branch}` : source.fullName
    case "upload":
      return source.filename
    case "git":
      return source.url
    case "image":
      return source.image
    case "compose":
      return source.filename
    case "dockerfile":
      return source.filename
  }
}
