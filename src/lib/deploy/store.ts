import { cancelDeployment, isTerminal, materializeDeployment, sourceLabel } from "./engine"
import { createInitialState } from "./fixtures"
import {
  classifyHostname,
  createId,
  dnsRecordsFor,
  HOME_SERVER_ID,
  memoryForFramework,
  portTaken,
  projectEndpoint,
  serverMetrics,
  shortSha,
  shouldFailVerification,
  sourceText,
  uniqueSlug,
} from "./helpers"
import { collectLogs } from "./logs"
import type {
  ActivityEvent,
  AddDomainInput,
  AppState,
  Container,
  CreateProjectInput,
  Deployment,
  LogQuery,
  Project,
  ProjectPatch,
  Server,
  Settings,
} from "./types"
import { DeployError, SCHEMA_VERSION } from "./types"

const STORAGE_KEY = "arcellite-deploy-state-v1"
export const THEME_KEY = "arcellite-deploy-theme"
export const MOTION_KEY = "arcellite-deploy-motion"

const serverSnapshot: AppState = createInitialState(0)
let current: AppState = serverSnapshot
let ready = false
let boots = 0
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isReady(): boolean {
  return ready
}

export function getSnapshot(): AppState {
  return ready ? current : serverSnapshot
}

export function getServerSnapshot(): AppState {
  return serverSnapshot
}

function isState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false
  const candidate = value as AppState
  return (
    candidate.schema === SCHEMA_VERSION &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.deployments) &&
    Array.isArray(candidate.servers) &&
    !!candidate.settings &&
    !!candidate.github
  )
}

function readStorage(): AppState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isState(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeStorage(state: AppState) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* demo state is best-effort */
  }
}

function syncPrefs(state: AppState) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(THEME_KEY, state.settings.theme)
  window.localStorage.setItem(MOTION_KEY, state.settings.motion)
  const root = document.documentElement
  const theme = state.settings.theme
  // Split shell is fixed; keep the legacy preference without recoloring surfaces.
  root.dataset.theme = "light"
  root.dataset.themeChoice = theme
  root.dataset.motion = state.settings.motion
}

function hasPending(state: AppState): boolean {
  if (state.deployments.some((deployment) => !isTerminal(deployment))) return true
  if (state.containers.some((container) => container.state === "restarting" || container.state === "starting")) {
    return true
  }
  if (state.domains.some((domain) => domain.status === "verifying" || domain.status === "issuing")) return true
  return false
}

function ensureTimer() {
  if (boots <= 0 || timer || !hasPending(current)) return
  timer = setInterval(() => {
    tick()
    if (timer && !hasPending(current)) {
      clearInterval(timer)
      timer = null
    }
  }, 200)
}

function commit(next: AppState) {
  current = next
  writeStorage(next)
  syncPrefs(next)
  emit()
  ensureTimer()
}

function activity(
  state: AppState,
  input: Omit<ActivityEvent, "id" | "actor" | "timestamp"> & { timestamp?: string },
): AppState {
  const event: ActivityEvent = {
    id: createId("act"),
    actor: state.settings.displayName || "Robera",
    timestamp: input.timestamp ?? new Date().toISOString(),
    action: input.action,
    result: input.result,
    objectType: input.objectType,
    objectName: input.objectName,
    href: input.href,
    detail: input.detail,
  }
  return { ...state, activity: [event, ...state.activity].slice(0, 200) }
}

function requireProject(state: AppState, id: string): Project {
  const project = state.projects.find((item) => item.id === id)
  if (!project) throw new DeployError("Project unavailable", "That project is no longer in this workspace.")
  return project
}

function requireServer(state: AppState): Server {
  const server = state.servers.find((item) => item.id === HOME_SERVER_ID) ?? state.servers[0]
  if (!server) throw new DeployError("No server", "Add a server before deploying.")
  if (server.status === "offline") {
    throw new DeployError(
      "Server unavailable",
      `${server.name} is not accepting agent heartbeats. Reconnect it, then try again.`,
    )
  }
  return server
}

function assertGithub(state: AppState, project: Project) {
  if (project.source.type === "github" && !state.github.connected) {
    throw new DeployError(
      "Repository access lost",
      `Reconnect GitHub to deploy ${project.source.fullName}. This demo account is disconnected.`,
    )
  }
}

function settleDeployment(state: AppState, deployment: Deployment, now: number): AppState {
  const project = state.projects.find((item) => item.id === deployment.projectId)
  if (!project) return state
  const stamp = new Date(now).toISOString()
  if (deployment.status === "ready") {
    const projects = state.projects.map((item) =>
      item.id === project.id
        ? {
            ...item,
            liveDeploymentId: deployment.id,
            commitSha: deployment.commitSha,
            commitMessage: deployment.commitMessage,
            branch: deployment.branch,
            runtime: "running" as const,
            updatedAt: deployment.finishedAt ?? stamp,
          }
        : item,
    )
    const image = `arcellite/${project.slug}:${deployment.commitSha}`
    let containers = state.containers
    const existing = containers.find((container) => container.projectId === project.id && container.role === "web")
    if (existing) {
      containers = containers.map((container) =>
        container.id === existing.id
          ? {
              ...container,
              image,
              state: "running" as const,
              startedAt: deployment.finishedAt ?? stamp,
              stateChangedAt: deployment.finishedAt ?? stamp,
              command: project.startCommand,
              ports: [{ host: project.exposedPort, container: project.internalPort, protocol: "tcp" as const }],
              memoryMb: memoryForFramework(project.framework),
            }
          : container,
      )
    } else {
      containers = [
        ...containers,
        {
          id: createId("ctr"),
          name: `${project.slug}-web`,
          serverId: HOME_SERVER_ID,
          projectId: project.id,
          role: "web" as const,
          image,
          state: "running" as const,
          startedAt: deployment.finishedAt ?? stamp,
          stateChangedAt: deployment.finishedAt ?? stamp,
          cpuPercent: 1.4,
          memoryMb: memoryForFramework(project.framework),
          ports: [{ host: project.exposedPort, container: project.internalPort, protocol: "tcp" as const }],
          command: project.startCommand,
          restartPolicy: project.restartPolicy,
        },
      ]
    }
    return activity(
      { ...state, projects, containers },
      {
        action: "Deployment succeeded",
        result: "success",
        objectType: "Deployment",
        objectName: project.name,
        href: `/deployments/${deployment.id}`,
        detail: `${deployment.commitSha} · ${projectEndpoint(project)}`,
        timestamp: deployment.finishedAt ?? stamp,
      },
    )
  }
  if (deployment.status === "failed") {
    return activity(state, {
      action: "Deployment failed",
      result: "error",
      objectType: "Deployment",
      objectName: project.name,
      href: `/deployments/${deployment.id}`,
      detail: deployment.error?.title ?? "The deployment failed.",
      timestamp: deployment.finishedAt ?? stamp,
    })
  }
  if (deployment.status === "canceled") {
    return activity(state, {
      action: "Deployment canceled",
      result: "warning",
      objectType: "Deployment",
      objectName: project.name,
      href: `/deployments/${deployment.id}`,
      detail: deployment.error?.affects ?? null,
      timestamp: deployment.finishedAt ?? stamp,
    })
  }
  return state
}

function tick() {
  if (!ready) return
  const now = Date.now()
  const stamp = new Date(now).toISOString()
  let next = current
  let changed = false

  const deployments = next.deployments.map((deployment) => {
    if (isTerminal(deployment)) return deployment
    const projected = materializeDeployment(deployment, now)
    if (projected.status === deployment.status && projected.phase === deployment.phase) return deployment
    changed = true
    return projected
  })
  next = { ...next, deployments }

  for (const deployment of deployments) {
    const previous = current.deployments.find((item) => item.id === deployment.id)
    if (previous && !isTerminal(previous) && isTerminal(deployment)) {
      next = settleDeployment(next, deployment, now)
      changed = true
    }
  }

  const domains = next.domains.map((domain) => {
    if (domain.status !== "verifying" && domain.status !== "issuing") return domain
    if (!domain.verifyStartedAt) return domain
    const elapsed = now - Date.parse(domain.verifyStartedAt)
    if (domain.failVerification && elapsed >= 1400) {
      changed = true
      return {
        ...domain,
        status: "invalid" as const,
        ssl: "failed" as const,
        error: `No TXT record was found at _arcellite.${domain.name}. Add the record, then verify again.`,
      }
    }
    if (!domain.failVerification && elapsed >= 3000) {
      changed = true
      return {
        ...domain,
        status: "active" as const,
        ssl: "simulated-active" as const,
        error: null,
        verifiedAt: stamp,
      }
    }
    if (!domain.failVerification && elapsed >= 1400 && domain.status !== "issuing") {
      changed = true
      return { ...domain, status: "issuing" as const, ssl: "pending" as const }
    }
    return domain
  })
  const domainsChanged = domains.some((domain, index) => domain !== current.domains[index])
  if (domainsChanged) {
    next = { ...next, domains }
    changed = true
  }
  for (const domain of domains) {
    const previous = current.domains.find((item) => item.id === domain.id)
    if (!previous || previous.status === domain.status) continue
    if (domain.status === "active") {
      next = activity(next, {
        action: "Domain verified",
        result: "success",
        objectType: "Domain",
        objectName: domain.name,
        href: "/domains",
        detail: "Simulated certificate marked active. Phase 1 does not contact a certificate authority.",
      })
    } else if (domain.status === "invalid") {
      next = activity(next, {
        action: "Domain verification failed",
        result: "error",
        objectType: "Domain",
        objectName: domain.name,
        href: "/domains",
        detail: domain.error,
      })
    }
  }

  const containers = next.containers.map((container) => {
    if (container.state !== "restarting" && container.state !== "starting") return container
    const since = container.stateChangedAt ? Date.parse(container.stateChangedAt) : now
    const wait = container.state === "restarting" ? 900 : 700
    if (now - since < wait) return container
    changed = true
    return { ...container, state: "running" as const, startedAt: stamp, stateChangedAt: stamp }
  })
  for (const container of containers) {
    const previous = current.containers.find((item) => item.id === container.id)
    if (!previous || previous.state === container.state) continue
    if (container.state !== "running") continue
    const project = container.projectId ? next.projects.find((item) => item.id === container.projectId) : undefined
    const projects =
      project && container.role === "web"
        ? next.projects.map((item) => (item.id === project.id ? { ...item, runtime: "running" as const } : item))
        : next.projects
    next = activity(
      { ...next, containers, projects },
      {
        action: previous.state === "restarting" ? "Container restarted" : "Container started",
        result: "success",
        objectType: "Container",
        objectName: container.name,
        href: `/containers?inspect=${container.id}`,
        detail: null,
        timestamp: stamp,
      },
    )
    changed = true
  }
  if (containers !== next.containers) {
    const same = next.containers.length === containers.length && next.containers.every((container, index) => container === containers[index])
    if (!same) next = { ...next, containers }
  }

  if (changed) commit(next)
}

export function bootStore(): () => void {
  boots += 1
  if (!ready && typeof window !== "undefined") {
    const stored = readStorage()
    current = stored ?? createInitialState(Date.now())
    if (!stored) writeStorage(current)
    ready = true
    syncPrefs(current)
    emit()
    tick()
  }
  ensureTimer()
  return () => {
    boots -= 1
    if (boots <= 0 && timer) {
      clearInterval(timer)
      timer = null
      boots = 0
    }
  }
}

function replaceProject(state: AppState, project: Project): AppState {
  return { ...state, projects: state.projects.map((item) => (item.id === project.id ? project : item)) }
}

export const actions = {
  createProject(input: CreateProjectInput): Project {
    const name = input.name.trim()
    if (!name) throw new DeployError("Name the project", "A project name is required.")
    if (portTaken(current.projects, input.exposedPort)) {
      throw new DeployError("Port unavailable", `${input.exposedPort} is already assigned on this server.`)
    }
    const now = new Date().toISOString()
    const project: Project = {
      id: createId("proj"),
      name,
      slug: uniqueSlug(name, current.projects),
      environment: input.environment,
      framework: input.framework,
      source: input.source,
      branch: input.branch,
      commitSha: null,
      commitMessage: null,
      packageManager: input.packageManager,
      installCommand: input.installCommand,
      buildCommand: input.buildCommand,
      startCommand: input.startCommand,
      outputDirectory: input.outputDirectory,
      rootDirectory: input.rootDirectory || ".",
      internalPort: input.internalPort,
      exposedPort: input.exposedPort,
      portMode: input.portMode,
      healthPath: input.healthPath || "/",
      restartPolicy: input.restartPolicy,
      cpuLimit: input.cpuLimit,
      memoryLimitMb: input.memoryLimitMb,
      autoDeploy: input.autoDeploy,
      hostname: `${uniqueSlug(name, current.projects)}.local`,
      createdAt: now,
      updatedAt: now,
      runtime: "running",
      simulateFailure: input.simulateFailure ?? false,
      env: input.env,
      liveDeploymentId: null,
    }
    let repositories = current.repositories
    const source = project.source
    if (source.type === "github") {
      repositories = repositories.map((repo) =>
        repo.fullName === source.fullName && !repo.importedProjectId
          ? { ...repo, importedProjectId: project.id }
          : repo,
      )
    }
    const next = activity(
      { ...current, projects: [project, ...current.projects], repositories },
      {
        action: "Project created",
        result: "success",
        objectType: "Project",
        objectName: project.name,
        href: `/projects/${project.id}`,
        detail: sourceText(project),
      },
    )
    commit(next)
    return project
  },

  updateProject(id: string, patch: ProjectPatch): Project {
    const project = requireProject(current, id)
    if (patch.exposedPort != null && portTaken(current.projects, patch.exposedPort, id)) {
      throw new DeployError("Port unavailable", `${patch.exposedPort} is already assigned on this server.`)
    }
    const nextProject: Project = {
      ...project,
      ...patch,
      name: patch.name?.trim() || project.name,
      updatedAt: new Date().toISOString(),
    }
    let next = replaceProject(current, nextProject)
    if (patch.env) {
      next = activity(next, {
        action: "Environment variable updated",
        result: "info",
        objectType: "Project",
        objectName: nextProject.name,
        href: `/projects/${id}/environment`,
        detail: null,
      })
    }
    commit(next)
    return nextProject
  },

  deleteProject(id: string): void {
    const project = requireProject(current, id)
    const projects = current.projects.filter((item) => item.id !== id)
    const deployments = current.deployments.filter((item) => item.projectId !== id)
    const domains = current.domains.filter((item) => item.projectId !== id)
    const containers = current.containers.flatMap((container) => {
      if (container.projectId !== id) return [container]
      if (container.role === "data") return [{ ...container, projectId: null }]
      return []
    })
    const databases = current.databases.map((database) =>
      database.projectId === id ? { ...database, projectId: null } : database,
    )
    const repositories = current.repositories.map((repo) =>
      repo.importedProjectId === id ? { ...repo, importedProjectId: null } : repo,
    )
    commit(
      activity(
        { ...current, projects, deployments, domains, containers, databases, repositories },
        {
          action: "Project deleted",
          result: "warning",
          objectType: "Project",
          objectName: project.name,
          href: "/projects",
          detail: "Removed from this control plane.",
        },
      ),
    )
  },

  startDeployment(projectId: string): Deployment {
    const project = requireProject(current, projectId)
    requireServer(current)
    assertGithub(current, project)
    const now = new Date().toISOString()
    const id = createId("dep")
    const deployment: Deployment = {
      id,
      projectId,
      environment: project.environment,
      status: "queued",
      phase: "queued",
      steps: [],
      branch: project.branch,
      commitSha: shortSha(`${id}:${project.slug}:${now}`),
      commitMessage: "Manual deployment",
      createdAt: now,
      startedAt: now,
      finishedAt: null,
      triggeredBy: current.settings.displayName || "Robera",
      failAt: project.simulateFailure ? "building" : null,
      previousRelease: Boolean(project.liveDeploymentId),
      error: null,
      sourceLabel: sourceLabel(project),
    }
    const projects = current.projects.map((item) => (item.id === projectId ? { ...item, updatedAt: now } : item))
    commit(
      activity(
        { ...current, projects, deployments: [deployment, ...current.deployments] },
        {
          action: "Deployment started",
          result: "info",
          objectType: "Deployment",
          objectName: project.name,
          href: `/deployments/${id}`,
          detail: deployment.sourceLabel,
        },
      ),
    )
    return deployment
  },

  cancelDeployment(id: string): Deployment {
    const deployment = current.deployments.find((item) => item.id === id)
    if (!deployment) throw new DeployError("Deployment unavailable", "That deployment no longer exists.")
    if (isTerminal(deployment)) return deployment
    const canceled = cancelDeployment(deployment, Date.now())
    const deployments = current.deployments.map((item) => (item.id === id ? canceled : item))
    commit(settleDeployment({ ...current, deployments }, canceled, Date.now()))
    return canceled
  },

  redeploy(projectId: string): Deployment {
    return actions.startDeployment(projectId)
  },

  refreshServer(id: string): Server {
    const server = current.servers.find((item) => item.id === id)
    if (!server) throw new DeployError("Server unavailable", "That server is not in this workspace.")
    if (server.status === "offline") {
      throw new DeployError("Server unavailable", `${server.name} is offline. Reconnect it before refreshing status.`)
    }
    const shift = server.sampleShift + 3
    const updated: Server = {
      ...server,
      sampleShift: shift,
      cpuPercent: Math.round((17 + ((shift % 5) - 2) * 0.8) * 10) / 10,
      memoryUsedGb: Math.round((4.8 + ((shift % 3) - 1) * 0.2) * 10) / 10,
      networkMbps: Math.round((14 + ((shift % 4) - 1.5) * 1.4) * 10) / 10,
      refreshedAt: new Date().toISOString(),
    }
    commit({ ...current, servers: current.servers.map((item) => (item.id === id ? updated : item)) })
    return updated
  },

  restartAgent(id: string): void {
    const server = current.servers.find((item) => item.id === id)
    if (!server) throw new DeployError("Server unavailable", "That server is not in this workspace.")
    if (server.status === "offline") {
      throw new DeployError("Server unavailable", `${server.name} is offline. Reconnect it before restarting the agent.`)
    }
    commit(
      activity(current, {
        action: "Agent restart requested",
        result: "info",
        objectType: "Server",
        objectName: server.name,
        href: `/servers/${server.id}`,
        detail: "Phase 1 records the request. No real agent is running.",
      }),
    )
  },

  disconnectServer(id: string): void {
    const server = current.servers.find((item) => item.id === id)
    if (!server) throw new DeployError("Server unavailable", "That server is not in this workspace.")
    const updated: Server = {
      ...server,
      status: "offline",
      dockerStatus: "unavailable",
      agentStatus: "offline",
    }
    commit(
      activity(
        { ...current, servers: current.servers.map((item) => (item.id === id ? updated : item)) },
        {
          action: "Server disconnected",
          result: "warning",
          objectType: "Server",
          objectName: server.name,
          href: `/servers/${server.id}`,
          detail: "The control plane will not send new work to this server.",
        },
      ),
    )
  },

  reconnectServer(id: string): void {
    const server = current.servers.find((item) => item.id === id)
    if (!server) throw new DeployError("Server unavailable", "That server is not in this workspace.")
    const updated: Server = {
      ...server,
      status: "online",
      dockerStatus: "running",
      agentStatus: "connected",
    }
    commit(
      activity(
        { ...current, servers: current.servers.map((item) => (item.id === id ? updated : item)) },
        {
          action: "Server connected",
          result: "success",
          objectType: "Server",
          objectName: server.name,
          href: `/servers/${server.id}`,
          detail: `${server.os} · ${server.ip}`,
        },
      ),
    )
  },

  containerAction(id: string, action: "start" | "stop" | "restart"): Container {
    requireServer(current)
    const container = current.containers.find((item) => item.id === id)
    if (!container) throw new DeployError("Container unavailable", "That container is not on this server.")
    const now = new Date().toISOString()
    let nextContainer: Container = container
    let projects = current.projects
    if (action === "stop") {
      if (container.state === "stopped" || container.state === "exited") return container
      nextContainer = { ...container, state: "stopped", stateChangedAt: now }
      if (container.role === "web" && container.projectId) {
        projects = projects.map((project) =>
          project.id === container.projectId ? { ...project, runtime: "stopped" } : project,
        )
      }
    } else if (action === "start") {
      if (container.state === "running") return container
      nextContainer = { ...container, state: "starting", stateChangedAt: now }
    } else {
      nextContainer = { ...container, state: "restarting", stateChangedAt: now }
    }
    const containers = current.containers.map((item) => (item.id === id ? nextContainer : item))
    let next: AppState = { ...current, containers, projects }
    if (action === "stop") {
      next = activity(next, {
        action: "Container stopped",
        result: "warning",
        objectType: "Container",
        objectName: container.name,
        href: `/containers?inspect=${container.id}`,
        detail: container.role === "web" ? "The local endpoint will not respond until the container starts." : null,
      })
    }
    commit(next)
    return nextContainer
  },

  addDomain(input: AddDomainInput): AppState["domains"][number] {
    const project = requireProject(current, input.projectId)
    const classified = classifyHostname(input.name)
    if ("error" in classified) throw new DeployError("Check the domain", classified.error)
    if (current.domains.some((domain) => domain.name === classified.name)) {
      throw new DeployError("Domain already added", `${classified.name} is already attached in this workspace.`)
    }
    const now = new Date().toISOString()
    const fail = classified.kind === "public" && shouldFailVerification(classified.name)
    const domain = {
      id: createId("dom"),
      name: classified.name,
      kind: classified.kind,
      projectId: project.id,
      targetPort: input.targetPort,
      status: classified.kind === "private" ? ("active" as const) : ("dns-required" as const),
      ssl: classified.kind === "private" ? ("none" as const) : ("pending" as const),
      createdAt: now,
      verifiedAt: classified.kind === "private" ? now : null,
      verifyStartedAt: null,
      failVerification: fail,
      records: classified.kind === "public" ? dnsRecordsFor(classified.name) : [],
      error: null,
    }
    commit(
      activity(
        { ...current, domains: [domain, ...current.domains] },
        {
          action: "Domain configured",
          result: "info",
          objectType: "Domain",
          objectName: domain.name,
          href: "/domains",
          detail: domain.status === "active" ? "Private hostname on this LAN." : "Waiting for DNS verification.",
        },
      ),
    )
    return domain
  },

  verifyDomain(id: string): void {
    const domain = current.domains.find((item) => item.id === id)
    if (!domain) throw new DeployError("Domain unavailable", "That domain is no longer in this workspace.")
    if (domain.kind !== "public") return
    if (domain.status === "active") return
    const domains = current.domains.map((item) =>
      item.id === id
        ? { ...item, status: "verifying" as const, verifyStartedAt: new Date().toISOString(), error: null, ssl: "pending" as const }
        : item,
    )
    commit({ ...current, domains })
  },

  deleteDomain(id: string): void {
    const domain = current.domains.find((item) => item.id === id)
    if (!domain) return
    commit(
      activity(
        { ...current, domains: current.domains.filter((item) => item.id !== id) },
        {
          action: "Domain removed",
          result: "warning",
          objectType: "Domain",
          objectName: domain.name,
          href: "/domains",
          detail: null,
        },
      ),
    )
  },

  connectGitHub(): void {
    if (current.github.connected) return
    commit(
      activity(
        {
          ...current,
          github: { ...current.github, connected: true, accountName: "Robera", accountLogin: "Roberadesissaii" },
        },
        {
          action: "GitHub connected",
          result: "success",
          objectType: "Git provider",
          objectName: "Roberadesissaii",
          href: "/settings",
          detail: "Mock installation. No token was stored.",
        },
      ),
    )
  },

  disconnectGitHub(): void {
    if (!current.github.connected) return
    commit(
      activity(
        { ...current, github: { ...current.github, connected: false } },
        {
          action: "GitHub disconnected",
          result: "warning",
          objectType: "Git provider",
          objectName: "Roberadesissaii",
          href: "/settings",
          detail: "Repository deploys are paused until you reconnect.",
        },
      ),
    )
  },

  updateSettings(patch: Partial<Settings>): Settings {
    const settings = { ...current.settings, ...patch }
    commit({ ...current, settings })
    return settings
  },

  completeOnboarding(): void {
    if (current.onboardingComplete) return
    commit({ ...current, onboardingComplete: true })
  },

  resetDemo(): void {
    const fresh = createInitialState(Date.now())
    fresh.settings = {
      ...fresh.settings,
      theme: current.settings.theme,
      motion: current.settings.motion,
    }
    fresh.onboardingComplete = true
    commit(fresh)
  },

  metrics(serverId: string) {
    const server = current.servers.find((item) => item.id === serverId)
    if (!server) throw new DeployError("Server unavailable", "That server is not in this workspace.")
    return serverMetrics(server, current)
  },

  logs(query: LogQuery) {
    return collectLogs(current, query, Date.now())
  },
}
