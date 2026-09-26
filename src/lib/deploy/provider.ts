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
  ProjectPatch,
  Server,
  ServerMetrics,
  Settings,
} from "./types"

/** Swap this implementation for a server-backed provider without redesigning the UI. */
export interface DeployProvider {
  subscribe(listener: () => void): () => void
  isReady(): boolean
  getSnapshot(): AppState
  getServerSnapshot(): AppState
  createProject(input: CreateProjectInput): Promise<Project>
  updateProject(id: string, patch: ProjectPatch): Promise<Project>
  deleteProject(id: string): Promise<void>
  startDeployment(projectId: string): Promise<Deployment>
  cancelDeployment(id: string): Promise<Deployment>
  redeploy(projectId: string): Promise<Deployment>
  refreshServer(id: string): Promise<Server>
  restartAgent(id: string): Promise<void>
  disconnectServer(id: string): Promise<void>
  reconnectServer(id: string): Promise<void>
  containerAction(id: string, action: "start" | "stop" | "restart"): Promise<Container>
  addDomain(input: AddDomainInput): Promise<Domain>
  verifyDomain(id: string): Promise<void>
  deleteDomain(id: string): Promise<void>
  connectGitHub(): Promise<void>
  disconnectGitHub(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  completeOnboarding(): Promise<void>
  resetDemo(): Promise<void>
  metrics(serverId: string): Promise<ServerMetrics>
  logs(query: LogQuery): Promise<LogEntry[]>
}
