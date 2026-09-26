import type {
  AppState,
  Deployment,
  DeploymentStatus,
  DnsRecord,
  DomainKind,
  Project,
  Server,
  ServerMetrics,
} from "./types"
import { materializeDeployment } from "./engine"

export const HOME_SERVER_ID = "srv_home"
export const SERVER_IP = "192.168.1.50"

export function createId(prefix: string): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${prefix}_${body}`
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "app"
}

export function uniqueSlug(name: string, projects: Project[]): string {
  const base = slugify(name)
  const taken = new Set(projects.map((project) => project.slug))
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export function shortSha(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 7)
}

export function projectEndpoint(project: Pick<Project, "exposedPort">, ip = SERVER_IP): string {
  return `http://${ip}:${project.exposedPort}`
}

export function nextFreePort(projects: Project[], start: number): number {
  const used = new Set(projects.map((project) => project.exposedPort))
  let port = Math.max(1, start)
  while (used.has(port) && port < 65535) port += 1
  return port
}

export function portTaken(projects: Project[], port: number, exceptId?: string): Project | undefined {
  return projects.find((project) => project.exposedPort === port && project.id !== exceptId)
}

export function homeServer(state: AppState): Server | undefined {
  return state.servers.find((server) => server.id === HOME_SERVER_ID) ?? state.servers[0]
}

export function latestDeployment(deployments: Deployment[], projectId: string, now: number): Deployment | null {
  const matches = deployments.filter((deployment) => deployment.projectId === projectId)
  if (!matches.length) return null
  matches.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return materializeDeployment(matches[0], now)
}

export function liveDeployment(state: AppState, project: Project, now: number): Deployment | null {
  if (!project.liveDeploymentId) return null
  const found = state.deployments.find((deployment) => deployment.id === project.liveDeploymentId)
  return found ? materializeDeployment(found, now) : null
}

export function projectBadge(project: Project, latest: Deployment | null): DeploymentStatus {
  if (project.runtime === "stopped") return "stopped"
  return latest?.status ?? "queued"
}

export function deploymentsFor(deployments: Deployment[], projectId: string, now: number): Deployment[] {
  return deployments
    .filter((deployment) => deployment.projectId === projectId)
    .map((deployment) => materializeDeployment(deployment, now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function sourceText(project: Project): string {
  const source = project.source
  switch (source.type) {
    case "github":
      return project.branch ? `${source.fullName} · ${project.branch}` : source.fullName
    case "upload":
      return `Upload · ${source.filename}`
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

export function classifyHostname(input: string): { name: string; kind: Exclude<DomainKind, "local"> } | { error: string } {
  let name = input.trim().toLowerCase()
  name = name.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "")
  if (!name) return { error: "Enter a domain." }
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(name)) {
    return { error: "Local endpoints are assigned from the server port. Enter a hostname to attach a domain." }
  }
  if (name.includes(" ") || name.includes("_")) return { error: "Hostnames cannot contain spaces or underscores." }
  const labels = name.split(".")
  if (labels.length < 2) return { error: "Enter a full hostname, such as app.example.com or app.local." }
  if (labels.some((label) => !/^[a-z0-9-]+$/.test(label) || label.startsWith("-") || label.endsWith("-"))) {
    return { error: "Use letters, numbers, and hyphens in each part of the hostname." }
  }
  const kind = name.endsWith(".local") ? "private" : "public"
  return { name, kind }
}

export function dnsRecordsFor(name: string, ip = SERVER_IP): DnsRecord[] {
  return [
    {
      type: "A",
      host: name,
      value: ip,
      purpose: "Points the hostname at this server.",
    },
    {
      type: "TXT",
      host: `_arcellite.${name}`,
      value: "arcellite-verify=demo",
      purpose: "Shows control of the hostname. Phase 1 does not query public DNS.",
    },
  ]
}

export function shouldFailVerification(name: string): boolean {
  return name.endsWith(".invalid") || name.split(".").includes("invalid")
}

function waveEndingAt(end: number, amplitude: number, shift: number, points = 36): number[] {
  const raw: number[] = []
  for (let index = 0; index < points; index += 1) {
    const value =
      Math.sin((index + shift) / 5.5) * amplitude + Math.sin((index + shift) / 2.35) * amplitude * 0.45
    raw.push(value)
  }
  const last = raw[raw.length - 1] ?? 0
  const delta = end - last
  return raw.map((value, index) => (index === raw.length - 1 ? end : value + delta))
}

export function serverMetrics(server: Server, state: AppState): ServerMetrics {
  const containers = state.containers.filter((container) => container.serverId === server.id)
  const runningContainers = containers.filter((container) => container.state === "running" || container.state === "starting" || container.state === "restarting").length
  const deploymentCount = state.deployments.filter((deployment) => deployment.status === "ready").length
  if (server.status === "offline") {
    return {
      available: false,
      reason: `${server.name} is not accepting agent heartbeats.`,
      cpu: 0,
      memoryUsedGb: 0,
      memoryTotalGb: server.memoryTotalGb,
      storageUsedGb: 0,
      storageTotalGb: server.storageTotalGb,
      networkMbps: 0,
      containerCount: containers.length,
      runningContainers: 0,
      deploymentCount,
      series: { cpu: [], memory: [], disk: [], network: [] },
    }
  }
  const memoryPercent = (server.memoryUsedGb / server.memoryTotalGb) * 100
  const diskPercent = (server.storageUsedGb / server.storageTotalGb) * 100
  return {
    available: true,
    reason: null,
    cpu: server.cpuPercent,
    memoryUsedGb: server.memoryUsedGb,
    memoryTotalGb: server.memoryTotalGb,
    storageUsedGb: server.storageUsedGb,
    storageTotalGb: server.storageTotalGb,
    networkMbps: server.networkMbps,
    containerCount: containers.length,
    runningContainers,
    deploymentCount,
    series: {
      cpu: waveEndingAt(server.cpuPercent, 6, server.sampleShift),
      memory: waveEndingAt(memoryPercent, 2.5, server.sampleShift + 2),
      disk: waveEndingAt(diskPercent, 0.35, server.sampleShift + 1),
      network: waveEndingAt(server.networkMbps, 5, server.sampleShift + 4),
    },
  }
}

export function redactMessage(message: string): string {
  return message
    .replace(/(password|token|secret|api_key|key)=([^\s]+)/gi, "$1=••••••••")
    .replace(/:\/\/([^:\s/]+):([^@\s/]+)@/g, "://$1:••••••••@")
}

export function memoryForFramework(framework: Project["framework"]): number {
  switch (framework) {
    case "nextjs":
      return 380
    case "vite":
      return 140
    case "fastapi":
    case "flask":
      return 220
    case "compose":
      return 260
    default:
      return 180
  }
}
