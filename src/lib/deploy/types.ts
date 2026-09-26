export const SCHEMA_VERSION = 1

export type Framework =
  | "nextjs"
  | "vite"
  | "node"
  | "express"
  | "fastapi"
  | "flask"
  | "static"
  | "dockerfile"
  | "compose"
  | "unknown"

export type EnvironmentName = "production" | "preview" | "development"

export type DeploymentStatus =
  | "queued"
  | "preparing"
  | "building"
  | "deploying"
  | "ready"
  | "failed"
  | "canceled"
  | "stopped"

export type DeploymentPhase =
  | "queued"
  | "preparing"
  | "installing"
  | "building"
  | "creating-image"
  | "starting"
  | "health-check"
  | "ready"

export type StepStatus = "pending" | "active" | "completed" | "failed" | "canceled"

export type RestartPolicy = "unless-stopped" | "on-failure" | "always" | "no"

export type ServerStatus = "online" | "degraded" | "offline"

export type ContainerState = "running" | "starting" | "restarting" | "stopped" | "exited"

export type DomainKind = "local" | "private" | "public"

export type DomainStatus =
  | "active"
  | "pending"
  | "invalid"
  | "dns-required"
  | "verifying"
  | "issuing"

export type SslState = "none" | "pending" | "simulated-active" | "failed"

export type LogLevel = "info" | "warn" | "error" | "debug"

export type ThemeChoice = "light" | "dark" | "system"

export type MotionChoice = "system" | "reduce" | "full"

export interface ProjectSourceGithub {
  type: "github"
  owner: string
  repo: string
  fullName: string
}

export interface ProjectSourceUpload {
  type: "upload"
  filename: string
  size: number
}

export interface ProjectSourceGit {
  type: "git"
  url: string
}

export interface ProjectSourceImage {
  type: "image"
  image: string
}

export interface ProjectSourceCompose {
  type: "compose"
  filename: string
}

export interface ProjectSourceDockerfile {
  type: "dockerfile"
  filename: string
}

export type ProjectSource =
  | ProjectSourceGithub
  | ProjectSourceUpload
  | ProjectSourceGit
  | ProjectSourceImage
  | ProjectSourceCompose
  | ProjectSourceDockerfile

export interface EnvironmentVariable {
  id: string
  key: string
  value: string
  secret: boolean
  scope: "all" | EnvironmentName
}

export interface Project {
  id: string
  name: string
  slug: string
  environment: EnvironmentName
  framework: Framework
  source: ProjectSource
  branch: string | null
  commitSha: string | null
  commitMessage: string | null
  packageManager: string | null
  installCommand: string
  buildCommand: string
  startCommand: string
  outputDirectory: string | null
  rootDirectory: string
  internalPort: number
  exposedPort: number
  portMode: "auto" | "custom"
  healthPath: string
  restartPolicy: RestartPolicy
  cpuLimit: number | null
  memoryLimitMb: number | null
  autoDeploy: boolean
  hostname: string
  createdAt: string
  updatedAt: string
  runtime: "running" | "stopped"
  simulateFailure: boolean
  env: EnvironmentVariable[]
  liveDeploymentId: string | null
}

export interface DeploymentStep {
  phase: DeploymentPhase
  label: string
  status: StepStatus
  startedAt: string | null
  finishedAt: string | null
}

export interface DeploymentError {
  title: string
  detail: string
  affects: string
  action: string
}

export interface Deployment {
  id: string
  projectId: string
  environment: EnvironmentName
  status: DeploymentStatus
  phase: DeploymentPhase
  steps: DeploymentStep[]
  branch: string | null
  commitSha: string
  commitMessage: string
  createdAt: string
  startedAt: string
  finishedAt: string | null
  triggeredBy: string
  failAt: DeploymentPhase | null
  previousRelease: boolean
  error: DeploymentError | null
  sourceLabel: string
}

export interface Server {
  id: string
  name: string
  status: ServerStatus
  os: string
  arch: string
  ip: string
  iface: string
  cidr: string
  gateway: string
  dns: string[]
  cpuCount: number
  memoryTotalGb: number
  storageTotalGb: number
  memoryUsedGb: number
  storageUsedGb: number
  cpuPercent: number
  networkMbps: number
  dockerVersion: string
  dockerStatus: "running" | "unavailable"
  agentVersion: string
  agentStatus: "connected" | "offline"
  startedAt: string
  sampleShift: number
  refreshedAt: string | null
}

export interface ContainerPort {
  host: number | null
  container: number
  protocol: "tcp" | "udp"
}

export interface Container {
  id: string
  name: string
  serverId: string
  projectId: string | null
  role: "web" | "worker" | "data"
  image: string
  state: ContainerState
  startedAt: string | null
  stateChangedAt: string | null
  cpuPercent: number
  memoryMb: number
  ports: ContainerPort[]
  command: string
  restartPolicy: RestartPolicy
}

export interface DnsRecord {
  type: "A" | "CNAME" | "TXT"
  host: string
  value: string
  purpose: string
}

export interface Domain {
  id: string
  name: string
  kind: DomainKind
  projectId: string
  targetPort: number
  status: DomainStatus
  ssl: SslState
  createdAt: string
  verifiedAt: string | null
  verifyStartedAt: string | null
  failVerification: boolean
  records: DnsRecord[]
  error: string | null
}

export interface Volume {
  id: string
  name: string
  serverId: string
  sizeGb: number
  path: string
  attachedTo: string
  attachmentLabel: string
  lastBackupAt: string | null
  createdAt: string
}

export type DatabaseEngine = "postgresql" | "mysql" | "redis"

export interface DatabaseService {
  id: string
  name: string
  engine: DatabaseEngine
  version: string
  status: "running" | "stopped"
  serverId: string
  projectId: string | null
  containerId: string
  host: string
  port: number
  username: string | null
  password: string | null
  database: string | null
  storageGb: number
  volumeId: string | null
}

export interface ActivityEvent {
  id: string
  action: string
  result: "success" | "warning" | "error" | "info"
  objectType: string
  objectName: string
  href: string | null
  actor: string
  timestamp: string
  detail: string | null
}

export interface LogEntry {
  id: string
  targetType: "project" | "deployment" | "container" | "server"
  targetId: string
  projectId: string | null
  level: LogLevel
  message: string
  timestamp: string
}

export interface GitRepository {
  id: string
  owner: string
  name: string
  fullName: string
  private: boolean
  language: string
  framework: Framework
  description: string
  defaultBranch: string
  branches: string[]
  updatedAt: string
  files: string[]
  importedProjectId: string | null
}

export interface GitHubState {
  connected: boolean
  accountName: string
  accountLogin: string
}

export interface Settings {
  theme: ThemeChoice
  motion: MotionChoice
  defaultBranch: string
  portAllocation: "auto" | "manual"
  portStart: number
  defaultEnvironment: EnvironmentName
  developerMode: boolean
  redactSecrets: boolean
  workspaceName: string
  displayName: string
  timezone: string
  notifyDeploySuccess: boolean
  notifyDeployFailure: boolean
  notifyDomains: boolean
  notifyServer: boolean
  logRetentionDays: number
  buildConcurrency: number
  autoRollback: boolean
}

export interface AppState {
  schema: number
  settings: Settings
  onboardingComplete: boolean
  github: GitHubState
  servers: Server[]
  projects: Project[]
  deployments: Deployment[]
  containers: Container[]
  domains: Domain[]
  volumes: Volume[]
  databases: DatabaseService[]
  activity: ActivityEvent[]
  operationalLogs: LogEntry[]
  repositories: GitRepository[]
}

export interface AnalysisCheck {
  label: string
  ok: boolean
}

export interface AnalysisResult {
  framework: Framework
  failed: boolean
  summary: string
  checks: AnalysisCheck[]
  packageManager: string | null
  installCommand: string
  buildCommand: string
  startCommand: string
  outputDirectory: string | null
  internalPort: number
  healthPath: string
  rootDirectory: string
  files: string[]
}

export interface CreateProjectInput {
  name: string
  environment: EnvironmentName
  framework: Framework
  source: ProjectSource
  branch: string | null
  rootDirectory: string
  packageManager: string | null
  installCommand: string
  buildCommand: string
  startCommand: string
  outputDirectory: string | null
  internalPort: number
  exposedPort: number
  portMode: "auto" | "custom"
  healthPath: string
  autoDeploy: boolean
  cpuLimit: number | null
  memoryLimitMb: number | null
  restartPolicy: RestartPolicy
  env: EnvironmentVariable[]
  simulateFailure?: boolean
}

export type ProjectPatch = Partial<
  Pick<
    Project,
    | "name"
    | "environment"
    | "framework"
    | "branch"
    | "rootDirectory"
    | "packageManager"
    | "installCommand"
    | "buildCommand"
    | "startCommand"
    | "outputDirectory"
    | "internalPort"
    | "exposedPort"
    | "portMode"
    | "healthPath"
    | "autoDeploy"
    | "cpuLimit"
    | "memoryLimitMb"
    | "restartPolicy"
    | "env"
    | "simulateFailure"
    | "hostname"
  >
>

export interface AddDomainInput {
  name: string
  projectId: string
  targetPort: number
}

export interface ServerMetrics {
  available: boolean
  reason: string | null
  cpu: number
  memoryUsedGb: number
  memoryTotalGb: number
  storageUsedGb: number
  storageTotalGb: number
  networkMbps: number
  containerCount: number
  runningContainers: number
  deploymentCount: number
  series: {
    cpu: number[]
    memory: number[]
    disk: number[]
    network: number[]
  }
}

export interface LogQuery {
  target: "all" | "project" | "deployment" | "container" | "server"
  id?: string
  level?: LogLevel | "all"
  search?: string
}

export class DeployError extends Error {
  readonly title: string
  readonly detail: string

  constructor(title: string, detail: string) {
    super(detail)
    this.name = "DeployError"
    this.title = title
    this.detail = detail
  }
}
