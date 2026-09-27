import { describe, expect, it, vi } from "vitest"
import type { ApiClient, HttpMethod, RequestOptions } from "@/lib/api/client"
import type { ProjectDTO } from "@/lib/api/contracts/project"
import { MOCK_CAPABILITIES } from "./mock-provider"
import { projectInput } from "./provider.contract"
import { createServerDeployProvider, planEnvChanges, SERVER_CAPABILITIES, toCreateRequest } from "./server-provider"
import { DeployError, type EnvironmentVariable } from "./types"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const NOW = "2026-09-27T00:00:00.000Z"

function projectDTO(overrides: Partial<ProjectDTO> = {}): ProjectDTO {
  return {
    id: PROJECT_ID,
    name: "Web",
    slug: "web",
    environment: "production",
    framework: "nextjs",
    source: { type: "git", url: "https://github.com/a/b.git" },
    branch: "main",
    rootDirectory: ".",
    packageManager: "pnpm",
    installCommand: "pnpm i",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
    outputDirectory: null,
    internalPort: 3000,
    exposedPort: 8100,
    portMode: "custom",
    healthPath: "/",
    restartPolicy: "unless-stopped",
    cpuLimit: null,
    memoryLimitMb: null,
    autoDeploy: false,
    runtimeState: "not-deployed",
    activeDeploymentId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

const SETTINGS = {
  workspaceName: "Arcellite Lab",
  displayName: "Ada",
  timezone: "UTC",
  defaultBranch: "main",
  defaultEnvironment: "production",
  portAllocation: "auto",
  portStart: 8082,
  buildConcurrency: 1,
  logRetentionDays: 14,
  autoRollback: true,
  redactSecrets: true,
  notifyDeploySuccess: true,
  notifyDeployFailure: true,
  notifyDomains: true,
  notifyServer: true,
}

const ME = {
  user: { id: "22222222-2222-4222-8222-222222222222", login: "ada", displayName: "Ada" },
  workspace: { id: "33333333-3333-4333-8333-333333333333", name: "Arcellite Lab", slug: "arcellite-lab" },
  role: "owner",
  capabilities: ["read_project"],
}

const SECRET_ENV = { id: "44444444-4444-4444-8444-444444444444", key: "API_TOKEN", scope: "all", secret: true, hasValue: true }
const PLAIN_ENV = { id: "55555555-5555-4555-8555-555555555555", key: "URL", scope: "all", secret: false, value: "https://x" }

/** An in-memory control plane answering the routes the provider calls. */
function fakeServer() {
  const calls: { method: HttpMethod; path: string; body?: unknown; idempotencyKey?: string }[] = []
  let projects: ProjectDTO[] = [projectDTO()]
  const client: ApiClient = {
    async request<T>(method: HttpMethod, path: string, options: RequestOptions<T> = {}): Promise<T> {
      calls.push({ method, path, body: options.body, idempotencyKey: options.idempotencyKey })
      const respond = (value: unknown) => (options.schema ? options.schema.parse(value) : value) as T
      if (path === "/api/v1/auth/me") return respond(ME)
      if (path === "/api/v1/settings") return respond(method === "PATCH" ? { ...SETTINGS, ...(options.body as object) } : SETTINGS)
      if (path === "/api/v1/activity") return respond([])
      if (path === "/api/v1/projects" && method === "GET") return respond(projects)
      if (path === "/api/v1/projects" && method === "POST") {
        const created = projectDTO({ id: "66666666-6666-4666-8666-666666666666", name: (options.body as { name: string }).name })
        projects = [...projects, created]
        return respond(created)
      }
      if (path.endsWith("/environment") && method === "GET") return respond([SECRET_ENV, PLAIN_ENV])
      if (path.endsWith("/reveal")) return respond({ id: SECRET_ENV.id, key: "API_TOKEN", value: "revealed" })
      if (path.startsWith("/api/v1/projects/") && method === "GET") return respond(projects.find((project) => path.endsWith(project.id)))
      if (path.startsWith("/api/v1/projects/") && method === "DELETE" && !path.includes("environment")) {
        projects = projects.filter((project) => !path.endsWith(project.id))
        return undefined as T
      }
      return respond(projects[0])
    },
    get(path, options) {
      return this.request("GET", path, options)
    },
  }
  return { client, calls }
}

class FakeEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 1
  listeners = new Map<string, (event: MessageEvent<string>) => void>()
  closed = false
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, listener)
  }
  close() {
    this.closed = true
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>)
  }
}

function setup() {
  const server = fakeServer()
  const source = new FakeEventSource()
  const navigate = vi.fn()
  const store = new Map<string, string>()
  const provider = createServerDeployProvider({
    client: server.client,
    openEvents: () => source,
    navigate,
    storage: () => ({ getItem: (key) => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) }),
  })
  return { provider, source, navigate, store, ...server }
}

async function started() {
  const context = setup()
  context.provider.start?.()
  await vi.waitFor(() => expect(context.provider.isReady()).toBe(true))
  return context
}

describe("ServerDeployProvider", () => {
  it("declares honest capabilities: a real control plane and no real infrastructure", () => {
    expect(SERVER_CAPABILITIES).toMatchObject({
      mode: "server",
      realControlPlane: true,
      deployments: false,
      realInfrastructure: false,
      realGitHub: false,
      realDomains: false,
      realMetrics: false,
      realLogs: false,
      secretRevealRequiresPassword: true,
    })
    expect(MOCK_CAPABILITIES).toMatchObject({ mode: "mock", realControlPlane: false, deployments: true, secretRevealRequiresPassword: false })
    expect(setup().provider.dev).toBeUndefined()
  })

  it("loads projects, env, settings, and the session; invents no infrastructure", async () => {
    const { provider } = await started()
    const state = provider.getSnapshot()
    expect(state.projects.map((project) => project.name)).toEqual(["Web"])
    expect(state.servers).toEqual([])
    expect(state.containers).toEqual([])
    expect(state.domains).toEqual([])
    expect(state.deployments).toEqual([])
    expect(state.repositories).toEqual([])
    expect(state.github.connected).toBe(false)
    expect(state.onboardingComplete).toBe(true)
    expect(provider.metrics("srv_home")).toBeNull()
    expect(provider.projectHealth(PROJECT_ID)).toBeNull()
    expect(provider.logs({ target: "all" })).toEqual([])
    expect(provider.auth?.session()?.user.displayName).toBe("Ada")
    const env = state.projects[0].env
    expect(env.find((item) => item.key === "API_TOKEN")).toMatchObject({ secret: true, value: "", stored: true })
    expect(env.find((item) => item.key === "URL")).toMatchObject({ secret: false, value: "https://x" })
  })

  it("rejects infrastructure commands with FEATURE_NOT_AVAILABLE", async () => {
    const { provider } = await started()
    for (const command of [
      () => provider.startDeployment(PROJECT_ID),
      () => provider.redeploy(PROJECT_ID),
      () => provider.cancelDeployment("x"),
      () => provider.containerAction("x", "restart"),
      () => provider.addDomain({ name: "a.example.com", projectId: PROJECT_ID, targetPort: 80 }),
      () => provider.connectGitHub(),
      () => provider.restartAgent("x"),
    ]) {
      const error = await command().catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(DeployError)
      expect(error).toMatchObject({ code: "FEATURE_NOT_AVAILABLE" })
    }
  })

  it("creates a project through the API with the caller's idempotency key", async () => {
    const { provider, calls } = await started()
    const project = await provider.createProject(projectInput("Shop", { env: [{ id: "e1", key: "A", value: "1", secret: true, scope: "all" }] }), { idempotencyKey: "intent-1" })
    const post = calls.find((call) => call.method === "POST" && call.path === "/api/v1/projects")
    expect(post).toMatchObject({ idempotencyKey: "intent-1" })
    expect(post!.body).toMatchObject({ name: "Shop", env: [{ key: "A", value: "1", secret: true, scope: "all" }] })
    expect(post!.body).not.toHaveProperty("simulateFailure")
    expect(provider.getSnapshot().projects.some((item) => item.id === project.id)).toBe(true)
  })

  it("turns env edits into the minimal API calls and never resends a stored secret", async () => {
    const { provider, calls } = await started()
    const current = provider.getSnapshot().projects[0].env
    const next: EnvironmentVariable[] = [
      { ...current.find((item) => item.key === "API_TOKEN")!, key: "API_KEY" },
      { id: "new-1", key: "NEW", value: "v", secret: false, scope: "all" },
    ]
    calls.length = 0
    await provider.updateProject(PROJECT_ID, { env: next })
    const writes = calls.filter((call) => call.method !== "GET")
    expect(writes).toEqual([
      { method: "DELETE", path: `/api/v1/projects/${PROJECT_ID}/environment/${PLAIN_ENV.id}`, body: undefined, idempotencyKey: undefined },
      { method: "PATCH", path: `/api/v1/projects/${PROJECT_ID}/environment/${SECRET_ENV.id}`, body: { key: "API_KEY" }, idempotencyKey: undefined },
      { method: "POST", path: `/api/v1/projects/${PROJECT_ID}/environment`, body: { key: "NEW", value: "v", secret: false, scope: "all" }, idempotencyKey: undefined },
    ])
  })

  it("keeps theme, motion, and developer mode local; sends only workspace settings", async () => {
    const { provider, calls, store } = await started()
    calls.length = 0
    await provider.updateSettings({ theme: "dark", developerMode: true, defaultBranch: "trunk", redactSecrets: false })
    expect(calls.filter((call) => call.method === "PATCH")).toEqual([{ method: "PATCH", path: "/api/v1/settings", body: { defaultBranch: "trunk" }, idempotencyKey: undefined }])
    expect(store.get("arcellite-deploy-theme")).toBe("dark")
    expect(provider.getSnapshot().settings).toMatchObject({ theme: "dark", developerMode: true, defaultBranch: "trunk", redactSecrets: true })
    // Nothing canonical is written to browser storage.
    expect([...store.keys()].sort()).toEqual(["arcellite-deploy-developer", "arcellite-deploy-motion", "arcellite-deploy-theme"])
  })

  it("reveals a secret through the password-checked endpoint without caching it", async () => {
    const { provider, calls } = await started()
    expect(await provider.revealSecret!(PROJECT_ID, SECRET_ENV.id, "pw")).toBe("revealed")
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: `/api/v1/projects/${PROJECT_ID}/environment/${SECRET_ENV.id}/reveal`, body: { password: "pw" } })
    expect(JSON.stringify(provider.getSnapshot())).not.toContain("revealed")
  })

  it("refetches on stream events, resyncs on request, and leaves on session expiry", async () => {
    const { provider, source, calls, navigate } = await started()
    calls.length = 0
    source.emit({ seq: 5, id: "77777777-7777-4777-8777-777777777777", type: "project.updated", objectType: "project", objectId: PROJECT_ID, payload: {}, createdAt: NOW })
    await vi.waitFor(() => expect(calls.some((call) => call.path === `/api/v1/projects/${PROJECT_ID}`)).toBe(true))
    source.emit({ seq: 6, id: "88888888-8888-4888-8888-888888888888", type: "project.archived", objectType: "project", objectId: PROJECT_ID, payload: {}, createdAt: NOW })
    expect(provider.getSnapshot().projects).toEqual([])
    calls.length = 0
    source.listeners.get("resync")!({ data: "{}" } as MessageEvent<string>)
    await vi.waitFor(() => expect(calls.some((call) => call.path === "/api/v1/projects")).toBe(true))
    source.listeners.get("session-expired")!({ data: "{}" } as MessageEvent<string>)
    expect(source.closed).toBe(true)
    expect(navigate).toHaveBeenCalledWith("/login")
  })

  it("signs out through the API and closes the stream", async () => {
    const { provider, source, calls, navigate } = await started()
    await provider.auth!.signOut()
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/api/v1/auth/logout" })
    expect(source.closed).toBe(true)
    expect(navigate).toHaveBeenCalledWith("/login")
  })
})

describe("request mapping", () => {
  it("drops mock-only fields and blank variables from a create", () => {
    const request = toCreateRequest(projectInput("App", { env: [{ id: "x", key: " ", value: "", secret: false, scope: "all" }] }))
    expect(request).not.toHaveProperty("env")
    expect(Object.keys(request)).not.toContain("simulateFailure")
  })

  it("plans env changes: value only when changed, stored secrets kept when left blank", () => {
    const current: EnvironmentVariable[] = [
      { id: "s", key: "S", value: "", secret: true, scope: "all", stored: true },
      { id: "p", key: "P", value: "one", secret: false, scope: "all" },
    ]
    expect(planEnvChanges(current, current)).toEqual({ create: [], update: [], remove: [] })
    expect(planEnvChanges(current, [{ ...current[0], value: "new" }, { ...current[1], scope: "production" }])).toEqual({
      create: [],
      update: [
        { id: "s", patch: { value: "new" } },
        { id: "p", patch: { scope: "production" } },
      ],
      remove: [],
    })
    expect(planEnvChanges(current, [{ ...current[1], secret: true }]).remove).toEqual(["s"])
  })
})
