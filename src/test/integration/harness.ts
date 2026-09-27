import { sql } from "drizzle-orm"
import { db } from "@/server/db/client"
import * as activityRoute from "@/app/api/v1/activity/route"
import * as auditRoute from "@/app/api/v1/audit/route"
import * as bootstrapRoute from "@/app/api/v1/auth/bootstrap/route"
import * as loginRoute from "@/app/api/v1/auth/login/route"
import * as logoutRoute from "@/app/api/v1/auth/logout/route"
import * as meRoute from "@/app/api/v1/auth/me/route"
import * as statusRoute from "@/app/api/v1/auth/status/route"
import * as streamRoute from "@/app/api/v1/events/stream/route"
import * as jobRoute from "@/app/api/v1/jobs/[jobId]/route"
import * as jobsRoute from "@/app/api/v1/jobs/route"
import * as projectRoute from "@/app/api/v1/projects/[projectId]/route"
import * as variableRoute from "@/app/api/v1/projects/[projectId]/environment/[variableId]/route"
import * as revealRoute from "@/app/api/v1/projects/[projectId]/environment/[variableId]/reveal/route"
import * as environmentRoute from "@/app/api/v1/projects/[projectId]/environment/route"
import * as projectsRoute from "@/app/api/v1/projects/route"
import * as settingsRoute from "@/app/api/v1/settings/route"
import { hashPassword } from "@/server/auth/password"
import { userPreferences, users, workspaceMembers, workspaces } from "@/server/db/schema"
import { normalizeLogin } from "@/server/services/auth"

export const ORIGIN = "http://localhost:3000"

type Params = Record<string, string>
export type RouteHandler = (request: Request, context: { params: Promise<Params> }) => Promise<Response>

const TABLES = [
  "audit_log",
  "activity_events",
  "events",
  "idempotency_keys",
  "job_attempts",
  "jobs",
  "rate_limits",
  "environment_variables",
  "project_runtime_configs",
  "project_build_configs",
  "project_sources",
  "projects",
  "sessions",
  "workspace_settings",
  "workspace_members",
  "user_preferences",
  "workspaces",
  "users",
]

export async function resetDatabase() {
  await db().execute(sql.raw(`truncate table ${TABLES.join(", ")} restart identity cascade`))
}

export interface CallOptions {
  method?: string
  body?: unknown
  rawBody?: string
  params?: Params
  headers?: Record<string, string>
  /** Omit the Origin header entirely. */
  noOrigin?: boolean
  signal?: AbortSignal
}

/** Calls a route handler the way Next.js does, addressed to the loopback dev origin. */
export async function call(handler: RouteHandler, path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers({ host: "localhost:3000", ...options.headers })
  if (!options.noOrigin && !headers.has("origin")) headers.set("origin", ORIGIN)
  let body: string | undefined = options.rawBody
  if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers.set("content-type", "application/json")
  }
  const request = new Request(`${ORIGIN}${path}`, { method: options.method ?? "GET", headers, body, signal: options.signal })
  return handler(request, { params: Promise.resolve(options.params ?? {}) })
}

export function setCookies(response: Response): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";")
    const index = pair.indexOf("=")
    jar[pair.slice(0, index)] = decodeURIComponent(pair.slice(index + 1))
  }
  return jar
}

/** A signed-in browser: sends its cookies, and the CSRF header on unsafe methods. */
export class Browser {
  constructor(
    public session: string,
    public csrf: string,
  ) {}

  static from(response: Response): Browser {
    const jar = setCookies(response)
    if (!jar.arcellite_session || !jar.arcellite_csrf) throw new Error(`No session cookies (status ${response.status})`)
    return new Browser(jar.arcellite_session, jar.arcellite_csrf)
  }

  cookieHeader(): string {
    return `arcellite_session=${encodeURIComponent(this.session)}; arcellite_csrf=${encodeURIComponent(this.csrf)}`
  }

  call(handler: RouteHandler, path: string, options: CallOptions & { csrf?: string | null } = {}): Promise<Response> {
    const method = options.method ?? "GET"
    const headers: Record<string, string> = { cookie: this.cookieHeader(), ...options.headers }
    const csrf = options.csrf === undefined ? this.csrf : options.csrf
    if (method !== "GET" && csrf !== null) headers["x-csrf-token"] = csrf
    return call(handler, path, { ...options, headers })
  }
}

export const OWNER = { displayName: "Ada Owner", login: "ada@example.com", password: "correct horse battery staple" }

export async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

// ---------------------------------------------------------------------------
// Routes and fixtures


export const routes = {
  activity: activityRoute,
  audit: auditRoute,
  bootstrap: bootstrapRoute,
  login: loginRoute,
  logout: logoutRoute,
  me: meRoute,
  status: statusRoute,
  stream: streamRoute,
  job: jobRoute,
  jobs: jobsRoute,
  project: projectRoute,
  projects: projectsRoute,
  environment: environmentRoute,
  variable: variableRoute,
  reveal: revealRoute,
  settings: settingsRoute,
}

export async function bootstrapOwner(owner = OWNER): Promise<Browser> {
  const response = await call(routes.bootstrap.POST as RouteHandler, "/api/v1/auth/bootstrap", {
    method: "POST",
    body: { ...owner, passwordConfirmation: owner.password },
  })
  if (response.status !== 201) throw new Error(`bootstrap failed: ${response.status} ${await response.text()}`)
  return Browser.from(response)
}

export async function signIn(login: string, password: string): Promise<Response> {
  return call(routes.login.POST as RouteHandler, "/api/v1/auth/login", { method: "POST", body: { login, password } })
}

/**
 * Adds a person to a workspace directly (member management has no API yet) and signs them in.
 * With `workspaceName` a separate workspace is created for them instead.
 */
export async function addMember(role: "owner" | "admin" | "developer" | "viewer", login: string, options: { workspaceName?: string } = {}): Promise<Browser> {
  const password = "member password 123"
  const [user] = await db()
    .insert(users)
    .values({ login, loginNormalized: normalizeLogin(login), displayName: login, passwordHash: await hashPassword(password) })
    .returning({ id: users.id })
  await db().insert(userPreferences).values({ userId: user.id })
  let workspaceId: string
  if (options.workspaceName) {
    const [workspace] = await db().insert(workspaces).values({ name: options.workspaceName, slug: options.workspaceName.toLowerCase().replace(/\W+/g, "-") }).returning({ id: workspaces.id })
    workspaceId = workspace.id
    await db().execute(sql`insert into workspace_settings (workspace_id) values (${workspaceId})`)
  } else {
    const [workspace] = await db().select({ id: workspaces.id }).from(workspaces).limit(1)
    workspaceId = workspace.id
  }
  await db().insert(workspaceMembers).values({ workspaceId, userId: user.id, role })
  const response = await signIn(login, password)
  if (response.status !== 200) throw new Error(`member sign-in failed: ${response.status}`)
  return Browser.from(response)
}

let port = 9100

export function projectBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Web app",
    environment: "production",
    framework: "nextjs",
    source: { type: "git", url: "https://github.com/example/web.git" },
    branch: "main",
    rootDirectory: ".",
    packageManager: "pnpm",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
    outputDirectory: null,
    internalPort: 3000,
    exposedPort: port++,
    portMode: "custom",
    healthPath: "/",
    restartPolicy: "unless-stopped",
    cpuLimit: null,
    memoryLimitMb: null,
    autoDeploy: false,
    ...overrides,
  }
}

export async function createProject(browser: Browser, overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return browser.call(routes.projects.POST as RouteHandler, "/api/v1/projects", { method: "POST", body: projectBody(overrides), headers })
}
