import { z } from "zod"
import { createApiClient, type ApiClient } from "@/lib/api/client"
import { ActivityDtoSchema, type ActivityDTO } from "@/lib/api/contracts/activity"
import { AuthMeDtoSchema, RevealSecretResponseSchema, type AuthMeDTO } from "@/lib/api/contracts/auth"
import { EnvVarDtoSchema, type EnvVarCreate, type EnvVarDTO, type EnvVarPatch } from "@/lib/api/contracts/environment"
import { EventDtoSchema, type EventDTO } from "@/lib/api/contracts/event"
import { ProjectDtoSchema, type ProjectCreateRequest, type ProjectDTO, type ProjectUpdateRequest } from "@/lib/api/contracts/project"
import { SettingsDtoSchema, type SettingsDTO, type SettingsPatch } from "@/lib/api/contracts/settings"
import type { DeployProvider, DeployProviderCapabilities, DeploySession, MutationOptions } from "./provider"
import { MOTION_KEY, THEME_KEY } from "./store"
import {
  DeployError,
  SCHEMA_VERSION,
  type AppState,
  type CreateProjectInput,
  type EnvironmentVariable,
  type MotionChoice,
  type Project,
  type ProjectPatch,
  type Settings,
  type ThemeChoice,
} from "./types"

/**
 * What the control plane really does today: it stores projects, encrypted environment
 * variables, settings, and activity. It does not deploy, run containers, manage servers or
 * domains, or collect metrics, and it says so. Those reads come back empty and those
 * commands reject with FEATURE_NOT_AVAILABLE instead of pretending.
 */
export const SERVER_CAPABILITIES: DeployProviderCapabilities = {
  mode: "server",
  realControlPlane: true,
  deployments: false,
  realInfrastructure: false,
  realGitHub: false,
  realDomains: false,
  realMetrics: false,
  realLogs: false,
  secretReveal: true,
  secretRevealRequiresPassword: true,
}

export const DEVELOPER_MODE_KEY = "arcellite-deploy-developer"
export const EVENTS_PATH = "/api/v1/events/stream"

/** Local-only presentation preferences. Everything else is canonical on the server. */
interface LocalPrefs {
  theme: ThemeChoice
  motion: MotionChoice
  developerMode: boolean
}

interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void
  close(): void
  readonly readyState: number
}

export interface ServerProviderOptions {
  client?: ApiClient
  /** Opens the change feed. Defaults to a same-origin EventSource. */
  openEvents?: (url: string) => EventSourceLike
  /** Where local presentation prefs live; null disables persistence. */
  storage?: () => Pick<Storage, "getItem" | "setItem"> | null
  /** Full-page navigation, used when the session ends. */
  navigate?: (path: string) => void
  /** Mirror theme and motion onto <html>, as the mock does. */
  documentPrefs?: boolean
}

const unavailable = (what: string) =>
  new DeployError("Not available yet", `${what} is not available in this version of the control plane. Arcellite does not run workloads yet.`, {
    code: "FEATURE_NOT_AVAILABLE",
  })

function readPrefs(storage: Pick<Storage, "getItem"> | null): LocalPrefs {
  const theme = storage?.getItem(THEME_KEY)
  const motion = storage?.getItem(MOTION_KEY)
  return {
    theme: theme === "dark" || theme === "system" ? theme : "light",
    motion: motion === "reduce" || motion === "full" ? motion : "system",
    developerMode: storage?.getItem(DEVELOPER_MODE_KEY) === "true",
  }
}

const EMPTY_SETTINGS: Omit<Settings, "theme" | "motion" | "developerMode"> = {
  defaultBranch: "main",
  portAllocation: "auto",
  portStart: 8082,
  defaultEnvironment: "production",
  redactSecrets: true,
  workspaceName: "",
  displayName: "",
  timezone: "UTC",
  notifyDeploySuccess: true,
  notifyDeployFailure: true,
  notifyDomains: true,
  notifyServer: true,
  logRetentionDays: 14,
  buildConcurrency: 1,
  autoRollback: true,
}

/** Nothing about infrastructure is invented: no servers, containers, domains, or GitHub. */
export function emptyServerState(prefs: LocalPrefs): AppState {
  return {
    schema: SCHEMA_VERSION,
    settings: { ...EMPTY_SETTINGS, ...prefs },
    onboardingComplete: true,
    github: { connected: false, accountName: "", accountLogin: "" },
    servers: [],
    projects: [],
    deployments: [],
    containers: [],
    domains: [],
    volumes: [],
    databases: [],
    activity: [],
    operationalLogs: [],
    repositories: [],
  }
}

function toVariable(dto: EnvVarDTO): EnvironmentVariable {
  if (dto.secret) return { id: dto.id, key: dto.key, scope: dto.scope, secret: true, value: "", stored: dto.hasValue }
  return { id: dto.id, key: dto.key, scope: dto.scope, secret: false, value: dto.value }
}

function toProject(dto: ProjectDTO, env: EnvironmentVariable[]): Project {
  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    environment: dto.environment,
    framework: dto.framework,
    source: dto.source,
    branch: dto.branch,
    commitSha: null,
    commitMessage: null,
    packageManager: dto.packageManager,
    installCommand: dto.installCommand,
    buildCommand: dto.buildCommand,
    startCommand: dto.startCommand,
    outputDirectory: dto.outputDirectory,
    rootDirectory: dto.rootDirectory,
    internalPort: dto.internalPort,
    exposedPort: dto.exposedPort,
    portMode: dto.portMode,
    healthPath: dto.healthPath,
    restartPolicy: dto.restartPolicy,
    cpuLimit: dto.cpuLimit,
    memoryLimitMb: dto.memoryLimitMb,
    autoDeploy: dto.autoDeploy,
    // No domain is provisioned; the slug is the only honest identifier.
    hostname: dto.slug,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    runtime: "stopped",
    simulateFailure: false,
    env,
    liveDeploymentId: dto.activeDeploymentId,
  }
}

function toActivity(dto: ActivityDTO): AppState["activity"][number] {
  return { ...dto }
}

function toSettings(dto: SettingsDTO, prefs: LocalPrefs): Settings {
  const { redactSecrets, ...rest } = dto
  return { ...rest, redactSecrets, ...prefs }
}

const CONFIG_KEYS = [
  "name",
  "environment",
  "framework",
  "branch",
  "rootDirectory",
  "packageManager",
  "installCommand",
  "buildCommand",
  "startCommand",
  "outputDirectory",
  "internalPort",
  "exposedPort",
  "portMode",
  "healthPath",
  "autoDeploy",
  "cpuLimit",
  "memoryLimitMb",
  "restartPolicy",
] as const satisfies readonly (keyof ProjectUpdateRequest & keyof ProjectPatch)[]

export function toCreateRequest(input: CreateProjectInput): ProjectCreateRequest {
  const env: EnvVarCreate[] = input.env
    .filter((item) => item.key.trim())
    .map((item) => ({ key: item.key.trim(), scope: item.scope, secret: item.secret, value: item.value }))
  return {
    name: input.name,
    environment: input.environment,
    framework: input.framework,
    source: input.source,
    branch: input.branch,
    rootDirectory: input.rootDirectory,
    packageManager: input.packageManager,
    installCommand: input.installCommand,
    buildCommand: input.buildCommand,
    startCommand: input.startCommand,
    outputDirectory: input.outputDirectory,
    internalPort: input.internalPort,
    exposedPort: input.exposedPort,
    portMode: input.portMode,
    healthPath: input.healthPath,
    restartPolicy: input.restartPolicy,
    cpuLimit: input.cpuLimit,
    memoryLimitMb: input.memoryLimitMb,
    autoDeploy: input.autoDeploy,
    ...(env.length ? { env } : {}),
  }
}

export interface EnvPlan {
  create: EnvVarCreate[]
  update: { id: string; patch: EnvVarPatch }[]
  remove: string[]
}

/**
 * Turns an edited variable list into API calls. A saved secret arrives with value "" and
 * `stored: true`; leaving it "" keeps the stored value, typing replaces it.
 */
export function planEnvChanges(current: EnvironmentVariable[], next: EnvironmentVariable[]): EnvPlan {
  const before = new Map(current.map((item) => [item.id, item]))
  const plan: EnvPlan = { create: [], update: [], remove: [] }
  const kept = new Set<string>()
  for (const item of next) {
    if (!item.key.trim()) continue
    const previous = before.get(item.id)
    if (!previous) {
      plan.create.push({ key: item.key.trim(), scope: item.scope, secret: item.secret, value: item.value })
      continue
    }
    kept.add(item.id)
    const patch: EnvVarPatch = {}
    if (item.key.trim() !== previous.key) patch.key = item.key.trim()
    if (item.scope !== previous.scope) patch.scope = item.scope
    if (item.secret !== previous.secret) patch.secret = item.secret
    const keepsStored = previous.stored && item.value === ""
    if (!keepsStored && item.value !== previous.value) patch.value = item.value
    if (Object.keys(patch).length) plan.update.push({ id: item.id, patch })
  }
  for (const item of current) if (!kept.has(item.id)) plan.remove.push(item.id)
  return plan
}

const ProjectListSchema = z.array(ProjectDtoSchema)
const EnvListSchema = z.array(EnvVarDtoSchema)
const ActivityListSchema = z.array(ActivityDtoSchema)

export function createServerDeployProvider(options: ServerProviderOptions = {}): DeployProvider {
  const storage = () => {
    try {
      return options.storage ? options.storage() : typeof window === "undefined" ? null : window.localStorage
    } catch {
      return null
    }
  }
  const navigate = options.navigate ?? ((path: string) => window.location.assign(path))
  let signingOut = false
  const client =
    options.client ??
    createApiClient({
      onUnauthorized: () => {
        if (!signingOut) navigate("/login")
      },
    })
  const openEvents: (url: string) => EventSourceLike = options.openEvents ?? ((url) => new EventSource(url, { withCredentials: true }))

  let state = emptyServerState(readPrefs(storage()))
  let ready = false
  let me: AuthMeDTO | null = null
  const listeners = new Set<() => void>()
  let started = 0
  let events: EventSourceLike | null = null
  let loading: Promise<void> | null = null

  function emit() {
    for (const listener of listeners) listener()
  }

  function set(next: AppState) {
    state = next
    emit()
  }

  function syncDocumentPrefs() {
    const store = storage()
    try {
      store?.setItem(THEME_KEY, state.settings.theme)
      store?.setItem(MOTION_KEY, state.settings.motion)
      store?.setItem(DEVELOPER_MODE_KEY, String(state.settings.developerMode))
    } catch {
      // Preferences are best-effort.
    }
    if (!options.documentPrefs || typeof document === "undefined") return
    const root = document.documentElement
    root.dataset.theme = "light"
    root.dataset.themeChoice = state.settings.theme
    root.dataset.motion = state.settings.motion
  }

  function prefs(): LocalPrefs {
    return { theme: state.settings.theme, motion: state.settings.motion, developerMode: state.settings.developerMode }
  }

  async function fetchEnv(projectId: string): Promise<EnvironmentVariable[]> {
    const list = await client.get(`/api/v1/projects/${projectId}/environment`, { schema: EnvListSchema })
    return list.map(toVariable)
  }

  async function fetchProject(projectId: string): Promise<Project> {
    const [dto, env] = await Promise.all([client.get(`/api/v1/projects/${projectId}`, { schema: ProjectDtoSchema }), fetchEnv(projectId)])
    return toProject(dto, env)
  }

  function upsertProject(project: Project) {
    const exists = state.projects.some((item) => item.id === project.id)
    set({ ...state, projects: exists ? state.projects.map((item) => (item.id === project.id ? project : item)) : [project, ...state.projects] })
  }

  function dropProject(projectId: string) {
    set({ ...state, projects: state.projects.filter((item) => item.id !== projectId) })
  }

  async function refreshActivity() {
    const activity = await client.get("/api/v1/activity", { schema: ActivityListSchema })
    set({ ...state, activity: activity.map(toActivity) })
  }

  async function refreshSettings() {
    const settings = await client.get("/api/v1/settings", { schema: SettingsDtoSchema })
    set({ ...state, settings: toSettings(settings, prefs()) })
  }

  async function load(): Promise<void> {
    loading ??= (async () => {
      try {
        const [session, projects, settings, activity] = await Promise.all([
          client.get("/api/v1/auth/me", { schema: AuthMeDtoSchema }),
          client.get("/api/v1/projects", { schema: ProjectListSchema }),
          client.get("/api/v1/settings", { schema: SettingsDtoSchema }),
          client.get("/api/v1/activity", { schema: ActivityListSchema }),
        ])
        const envs = await Promise.all(projects.map((project) => fetchEnv(project.id)))
        me = session
        ready = true
        set({
          ...state,
          settings: toSettings(settings, prefs()),
          projects: projects.map((project, index) => toProject(project, envs[index])),
          activity: activity.map(toActivity),
        })
      } finally {
        loading = null
      }
    })()
    return loading
  }

  function quietly(work: Promise<unknown>) {
    work.catch(() => {
      // A failed background refresh keeps the last good cache; the next event retries.
    })
  }

  function handleEvent(event: EventDTO) {
    switch (event.type) {
      case "project.created":
      case "project.updated":
        if (event.objectId) quietly(fetchProject(event.objectId).then(upsertProject))
        quietly(refreshActivity())
        break
      case "project.archived":
        if (event.objectId) dropProject(event.objectId)
        quietly(refreshActivity())
        break
      case "environment.updated":
      case "environment.deleted": {
        const projectId = typeof event.payload.projectId === "string" ? event.payload.projectId : null
        if (projectId) quietly(fetchProject(projectId).then(upsertProject))
        quietly(refreshActivity())
        break
      }
      case "settings.updated":
        quietly(refreshSettings())
        quietly(refreshActivity())
        break
      default:
        break
    }
  }

  function openStream() {
    const source = openEvents(EVENTS_PATH)
    source.onmessage = (message) => {
      try {
        const parsed = EventDtoSchema.safeParse(JSON.parse(message.data))
        if (parsed.success) handleEvent(parsed.data)
      } catch {
        // Ignore malformed frames.
      }
    }
    source.addEventListener("resync", () => quietly(load()))
    source.addEventListener("session-expired", () => {
      source.close()
      navigate("/login")
    })
    source.onerror = () => {
      // EventSource retries on its own while CONNECTING. CLOSED means the server refused
      // the stream (for example a 401): reloading data surfaces the real reason.
      if (source.readyState === 2) {
        events = null
        quietly(load())
      }
    }
    events = source
  }

  const fail = (what: string) => () => Promise.reject(unavailable(what))

  const provider: DeployProvider = {
    capabilities: SERVER_CAPABILITIES,
    auth: {
      session(): DeploySession | null {
        if (!me) return null
        return { user: me.user, workspace: { id: me.workspace.id, name: me.workspace.name }, role: me.role, capabilities: me.capabilities }
      },
      async signOut() {
        signingOut = true
        try {
          await client.request("POST", "/api/v1/auth/logout")
        } finally {
          events?.close()
          events = null
          navigate("/login")
        }
      },
    },

    start() {
      started += 1
      if (started === 1) {
        syncDocumentPrefs()
        quietly(load())
        if (typeof window !== "undefined" || options.openEvents) openStream()
      }
      return () => {
        started -= 1
        if (started === 0) {
          events?.close()
          events = null
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isReady: () => ready,
    getSnapshot: () => state,
    getServerSnapshot: () => state,

    // There are no deployments, logs, or metrics yet: report nothing rather than inventing it.
    deployment: () => null,
    deploymentProgress: () => 0,
    deployments: () => [],
    latestDeployment: () => null,
    liveDeployment: () => null,
    logs: () => [],
    metrics: () => null,
    projectHealth: () => null,

    async createProject(input, commandOptions?: MutationOptions) {
      const dto = await client.request("POST", "/api/v1/projects", {
        body: toCreateRequest(input),
        idempotencyKey: commandOptions?.idempotencyKey,
        schema: ProjectDtoSchema,
      })
      const project = toProject(dto, await fetchEnv(dto.id))
      upsertProject(project)
      quietly(refreshActivity())
      return project
    },

    async updateProject(id, patch, commandOptions?: MutationOptions) {
      const current = state.projects.find((item) => item.id === id)
      if (!current) throw new DeployError("Not found", "That project was not found.", { code: "NOT_FOUND" })
      const config: ProjectUpdateRequest = {}
      for (const key of CONFIG_KEYS) {
        if (patch[key] !== undefined) Object.assign(config, { [key]: patch[key] })
      }
      if (Object.keys(config).length) {
        await client.request("PATCH", `/api/v1/projects/${id}`, { body: config, schema: ProjectDtoSchema })
      }
      if (patch.env) {
        const plan = planEnvChanges(current.env, patch.env)
        for (const variableId of plan.remove) await client.request("DELETE", `/api/v1/projects/${id}/environment/${variableId}`)
        for (const change of plan.update) await client.request("PATCH", `/api/v1/projects/${id}/environment/${change.id}`, { body: change.patch })
        for (const [index, variable] of plan.create.entries()) {
          await client.request("POST", `/api/v1/projects/${id}/environment`, {
            body: variable,
            idempotencyKey: commandOptions?.idempotencyKey ? `${commandOptions.idempotencyKey}:env:${index}` : undefined,
          })
        }
      }
      const project = await fetchProject(id)
      upsertProject(project)
      quietly(refreshActivity())
      return project
    },

    async deleteProject(id) {
      await client.request("DELETE", `/api/v1/projects/${id}`)
      dropProject(id)
      quietly(refreshActivity())
    },

    startDeployment: fail("Deploying"),
    cancelDeployment: fail("Canceling a deployment"),
    redeploy: fail("Redeploying"),
    refreshServer: fail("Server status"),
    restartAgent: fail("The server agent"),
    disconnectServer: fail("Server management"),
    reconnectServer: fail("Server management"),
    containerAction: fail("Container control"),
    addDomain: fail("Custom domains"),
    verifyDomain: fail("Domain verification"),
    deleteDomain: fail("Custom domains"),
    connectGitHub: fail("GitHub"),
    disconnectGitHub: fail("GitHub"),

    async updateSettings(patch) {
      const local: Partial<LocalPrefs> = {}
      if (patch.theme !== undefined) local.theme = patch.theme
      if (patch.motion !== undefined) local.motion = patch.motion
      if (patch.developerMode !== undefined) local.developerMode = patch.developerMode
      const remote: SettingsPatch = {}
      for (const [key, value] of Object.entries(patch)) {
        if (key === "theme" || key === "motion" || key === "developerMode" || key === "redactSecrets") continue
        Object.assign(remote, { [key]: value })
      }
      if (Object.keys(local).length) {
        set({ ...state, settings: { ...state.settings, ...local } })
        syncDocumentPrefs()
      }
      if (Object.keys(remote).length) {
        const dto = await client.request("PATCH", "/api/v1/settings", { body: remote, schema: SettingsDtoSchema })
        set({ ...state, settings: toSettings(dto, prefs()) })
        quietly(refreshActivity())
      }
      return state.settings
    },

    async completeOnboarding() {
      // Server mode has no mock welcome flow.
    },

    async revealSecret(projectId, variableId, password) {
      const result = await client.request("POST", `/api/v1/projects/${projectId}/environment/${variableId}/reveal`, {
        body: { password },
        schema: RevealSecretResponseSchema,
      })
      return result.value
    },
  }
  return provider
}
