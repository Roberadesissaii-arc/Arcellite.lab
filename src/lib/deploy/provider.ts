import type {
  AddDomainInput,
  AppState,
  Container,
  CreateProjectInput,
  Deployment,
  Domain,
  LogEntry,
  LogQuery,
  Project,
  ProjectHealth,
  ProjectPatch,
  Server,
  ServerMetrics,
  Settings,
} from "./types"

/** What the provider is actually connected to. Describes reality, not product rollout. */
export interface DeployProviderCapabilities {
  mode: "mock" | "server"
  /** Deployments, containers, and servers are real Docker/host operations. */
  realInfrastructure: boolean
  /** Repositories come from a real GitHub App installation. */
  realGitHub: boolean
  /** DNS checks and certificates are real. */
  realDomains: boolean
  /** Server and container metrics are sampled from real hosts. */
  realMetrics: boolean
  /** Log lines come from real builds and containers. */
  realLogs: boolean
  /** Saved secret values can be shown again in the browser. */
  secretReveal: boolean
}

/**
 * Per-call options for anything that changes state. A caller retrying the same user
 * intent passes the same key and gets the original result instead of a second effect.
 * Keys are chosen by the caller (one per user action), never generated per attempt.
 */
export interface MutationOptions {
  idempotencyKey?: string
}

/**
 * Tools that only make sense against simulated infrastructure. Production providers
 * leave `dev` undefined, and the UI hides whatever depends on it.
 */
export interface MockDevTools {
  resetDemo(): Promise<void>
  clearWorkspace(): Promise<void>
  /** The next deployment of the project fails at the build step. */
  setSimulateFailure(projectId: string, value: boolean): Promise<void>
  /** The raw workspace, including values a real provider never sends to the browser. */
  exportWorkspace(): AppState
}

/**
 * The only boundary feature UI talks to. Swap the implementation for a server-backed
 * provider without redesigning the UI.
 *
 * Reads are synchronous views of the provider's cache so rendering never flickers. They
 * may return null or empty while data loads; `subscribe` fires when the cache changes,
 * whether from a command, a stream event, or a query result arriving. Views that show
 * live progress also re-read on their own display interval.
 */
export interface DeployProvider {
  readonly capabilities: DeployProviderCapabilities
  readonly dev?: MockDevTools

  /** Opens the provider's cache (storage load, event stream). Returns a stop function. */
  start?(): () => void
  subscribe(listener: () => void): () => void
  isReady(): boolean
  getSnapshot(): AppState
  getServerSnapshot(): AppState

  deployment(id: string): Deployment | null
  /** How far a deployment has progressed, 0 to 1. */
  deploymentProgress(id: string): number
  /** Newest first. */
  deployments(filter?: { projectId?: string }): Deployment[]
  latestDeployment(projectId: string): Deployment | null
  /** The deployment whose release is serving the project. */
  liveDeployment(projectId: string): Deployment | null
  logs(query: LogQuery): LogEntry[]
  metrics(serverId: string): ServerMetrics | null
  projectHealth(projectId: string): ProjectHealth | null

  createProject(input: CreateProjectInput, options?: MutationOptions): Promise<Project>
  updateProject(id: string, patch: ProjectPatch, options?: MutationOptions): Promise<Project>
  deleteProject(id: string, options?: MutationOptions): Promise<void>
  startDeployment(projectId: string, options?: MutationOptions): Promise<Deployment>
  cancelDeployment(id: string, options?: MutationOptions): Promise<Deployment>
  redeploy(projectId: string, options?: MutationOptions): Promise<Deployment>
  refreshServer(id: string, options?: MutationOptions): Promise<Server>
  restartAgent(id: string, options?: MutationOptions): Promise<void>
  disconnectServer(id: string, options?: MutationOptions): Promise<void>
  reconnectServer(id: string, options?: MutationOptions): Promise<void>
  containerAction(id: string, action: "start" | "stop" | "restart", options?: MutationOptions): Promise<Container>
  addDomain(input: AddDomainInput, options?: MutationOptions): Promise<Domain>
  verifyDomain(id: string, options?: MutationOptions): Promise<void>
  deleteDomain(id: string, options?: MutationOptions): Promise<void>
  connectGitHub(options?: MutationOptions): Promise<void>
  disconnectGitHub(options?: MutationOptions): Promise<void>
  updateSettings(patch: Partial<Settings>, options?: MutationOptions): Promise<Settings>
  completeOnboarding(options?: MutationOptions): Promise<void>
}
