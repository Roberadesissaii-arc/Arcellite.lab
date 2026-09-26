import { materializeDeployment } from "./engine"
import { redactMessage } from "./helpers"
import type { AppState, Deployment, DeploymentPhase, LogEntry, LogLevel, LogQuery, Project } from "./types"

interface ScriptLine {
  delay: number
  level: LogLevel
  message: string
  successOnly?: boolean
}

function linesFor(phase: DeploymentPhase, project: Project, dep: Deployment): ScriptLine[] {
  const source = project.source
  const preparing =
    source.type === "github"
      ? `Cloning ${source.fullName}...`
      : source.type === "upload"
        ? `Unpacking ${source.filename}...`
        : source.type === "git"
          ? `Cloning ${source.url}...`
          : source.type === "image"
            ? `Pulling ${source.image}...`
            : source.type === "compose"
              ? `Reading ${source.filename}...`
              : "Reading Dockerfile..."

  switch (phase) {
    case "queued":
      return []
    case "preparing":
      return [
        { delay: 80, level: "info", message: preparing },
        { delay: 520, level: "info", message: `Resolved commit ${dep.commitSha}` },
        {
          delay: 980,
          level: "info",
          message: `Detected ${project.packageManager ?? project.framework}`,
        },
      ]
    case "installing":
      return [
        { delay: 120, level: "info", message: "Installing dependencies..." },
        {
          delay: 480,
          level: "debug",
          message: project.installCommand ? `$ ${project.installCommand}` : "No install command",
        },
        { delay: 1500, level: "info", message: "Dependencies installed", successOnly: true },
      ]
    case "building":
      return [
        { delay: 160, level: "debug", message: `$ ${project.buildCommand || "(no build command)"}` },
        { delay: 1700, level: "info", message: "Compiled successfully", successOnly: true },
      ]
    case "creating-image":
      return [
        { delay: 140, level: "info", message: "Creating runtime image" },
        {
          delay: 900,
          level: "info",
          message: `Tagged arcellite/${project.slug}:${dep.commitSha}`,
          successOnly: true,
        },
      ]
    case "starting":
      return [
        { delay: 160, level: "info", message: `Starting service on port ${project.internalPort}` },
        { delay: 720, level: "info", message: `Mapped host port ${project.exposedPort}`, successOnly: true },
      ]
    case "health-check":
      return [
        { delay: 140, level: "info", message: `Health check GET ${project.healthPath}` },
        { delay: 640, level: "info", message: "Health check passed", successOnly: true },
      ]
    case "ready":
      return []
  }
}

export function deploymentLogs(dep: Deployment, project: Project, now: number): LogEntry[] {
  const view = materializeDeployment(dep, now)
  const entries: LogEntry[] = []
  for (const step of view.steps) {
    if (!step.startedAt || step.status === "pending") continue
    const start = Date.parse(step.startedAt)
    if (step.phase === "ready") continue
    for (const [index, line] of linesFor(step.phase, project, view).entries()) {
      if (line.successOnly && step.status !== "completed") continue
      const at = start + line.delay
      if ((step.status === "active" || step.status === "canceled") && at > now) continue
      entries.push({
        id: `${dep.id}:${step.phase}:${index}`,
        targetType: "deployment",
        targetId: dep.id,
        projectId: project.id,
        level: line.level,
        message: line.message,
        timestamp: new Date(at).toISOString(),
      })
    }
    if (step.status === "failed" && step.finishedAt) {
      entries.push({
        id: `${dep.id}:${step.phase}:failed`,
        targetType: "deployment",
        targetId: dep.id,
        projectId: project.id,
        level: "error",
        message: view.error?.detail ?? "Step failed",
        timestamp: step.finishedAt,
      })
    }
  }
  if (view.status === "ready" && view.finishedAt) {
    entries.push({
      id: `${dep.id}:ready`,
      targetType: "deployment",
      targetId: dep.id,
      projectId: project.id,
      level: "info",
      message: "Deployment ready",
      timestamp: view.finishedAt,
    })
  }
  if (view.status === "canceled" && view.finishedAt) {
    entries.push({
      id: `${dep.id}:canceled`,
      targetType: "deployment",
      targetId: dep.id,
      projectId: project.id,
      level: "warn",
      message: "Deployment canceled",
      timestamp: view.finishedAt,
    })
  }
  return entries
}

export function collectLogs(state: AppState, query: LogQuery, now: number): LogEntry[] {
  const synthesized = state.deployments.flatMap((deployment) => {
    const project = state.projects.find((item) => item.id === deployment.projectId)
    if (!project) return []
    return deploymentLogs(deployment, project, now)
  })
  let entries = [...synthesized, ...state.operationalLogs]
  entries = entries.filter((entry) => {
    if (query.target === "all") return true
    if (!query.id) return false
    if (query.target === "project") return entry.projectId === query.id
    if (query.target === "deployment") return entry.targetType === "deployment" && entry.targetId === query.id
    if (query.target === "container") return entry.targetType === "container" && entry.targetId === query.id
    return entry.targetType === "server" && entry.targetId === query.id
  })
  if (query.level && query.level !== "all") {
    entries = entries.filter((entry) => entry.level === query.level)
  }
  const search = query.search?.trim().toLowerCase()
  if (search) entries = entries.filter((entry) => entry.message.toLowerCase().includes(search))
  if (state.settings.redactSecrets) {
    entries = entries.map((entry) => ({ ...entry, message: redactMessage(entry.message) }))
  }
  entries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  return entries
}
