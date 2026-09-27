import type {
  ActivityDTO,
  ContainerDTO,
  DeploymentDTO,
  DomainDTO,
  EnvVarDTO,
  LogEntryDTO,
  ProjectDTO,
  ProjectSourceDTO,
  ServerDTO,
  ServerMetricsDTO,
} from "@/lib/api/contracts"
import type {
  ActivityEvent,
  Container,
  Deployment,
  Domain,
  EnvironmentVariable,
  LogEntry,
  Project,
  ProjectSource,
  Server,
  ServerMetrics,
} from "./types"

/*
 * Mock internal model → safe wire representation. The mock keeps fields a real API never
 * returns (plaintext secrets, simulation switches, synthetic phases); these adapters are
 * where they stop. Every field is listed explicitly so new internal fields never leak by
 * default.
 */

export function toProjectSourceDTO(source: ProjectSource): ProjectSourceDTO {
  switch (source.type) {
    case "github":
      return { type: "github", owner: source.owner, repo: source.repo, fullName: source.fullName }
    case "upload":
      return { type: "upload", filename: source.filename, size: source.size }
    case "git":
      return { type: "git", url: source.url }
    case "image":
      return { type: "image", image: source.image }
    case "compose":
      return { type: "compose", filename: source.filename }
    case "dockerfile":
      return { type: "dockerfile", filename: source.filename }
  }
}

export function toProjectDTO(project: Project): ProjectDTO {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    environment: project.environment,
    framework: project.framework,
    source: toProjectSourceDTO(project.source),
    branch: project.branch,
    rootDirectory: project.rootDirectory,
    packageManager: project.packageManager,
    installCommand: project.installCommand,
    buildCommand: project.buildCommand,
    startCommand: project.startCommand,
    outputDirectory: project.outputDirectory,
    internalPort: project.internalPort,
    exposedPort: project.exposedPort,
    portMode: project.portMode,
    healthPath: project.healthPath,
    restartPolicy: project.restartPolicy,
    cpuLimit: project.cpuLimit,
    memoryLimitMb: project.memoryLimitMb,
    autoDeploy: project.autoDeploy,
    // The mock marks new projects "running" before any release; the contract does not.
    runtimeState: project.liveDeploymentId ? project.runtime : "not-deployed",
    activeDeploymentId: project.liveDeploymentId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export function toEnvVarDTO(variable: EnvironmentVariable): EnvVarDTO {
  if (variable.secret) {
    return { id: variable.id, key: variable.key, scope: variable.scope, secret: true, hasValue: variable.value.length > 0 }
  }
  return { id: variable.id, key: variable.key, scope: variable.scope, secret: false, value: variable.value }
}

export function toDeploymentDTO(deployment: Deployment): DeploymentDTO {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    environment: deployment.environment,
    status: deployment.status,
    phase: deployment.phase,
    steps: deployment.steps.map((step) => ({
      phase: step.phase,
      label: step.label,
      status: step.status,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
    })),
    branch: deployment.branch,
    commitSha: deployment.commitSha,
    commitMessage: deployment.commitMessage,
    sourceLabel: deployment.sourceLabel,
    triggeredBy: { kind: "user", name: deployment.triggeredBy },
    createdAt: deployment.createdAt,
    startedAt: deployment.startedAt,
    finishedAt: deployment.finishedAt,
    failure: deployment.error
      ? {
          title: deployment.error.title,
          detail: deployment.error.detail,
          affects: deployment.error.affects,
          action: deployment.error.action,
        }
      : null,
  }
}

export function toServerDTO(server: Server): ServerDTO {
  return {
    id: server.id,
    name: server.name,
    status: server.status,
    os: server.os,
    arch: server.arch,
    network: { ip: server.ip, iface: server.iface, cidr: server.cidr, gateway: server.gateway, dns: [...server.dns] },
    cpuCount: server.cpuCount,
    memoryTotalGb: server.memoryTotalGb,
    storageTotalGb: server.storageTotalGb,
    usage: {
      cpuPercent: server.cpuPercent,
      memoryUsedGb: server.memoryUsedGb,
      storageUsedGb: server.storageUsedGb,
      networkMbps: server.networkMbps,
    },
    docker: { version: server.dockerVersion, status: server.dockerStatus },
    agent: { version: server.agentVersion, status: server.agentStatus },
    startedAt: server.startedAt,
    observedAt: server.refreshedAt,
  }
}

export function toContainerDTO(container: Container): ContainerDTO {
  return {
    id: container.id,
    name: container.name,
    serverId: container.serverId,
    projectId: container.projectId,
    // Every mock container stands in for one Arcellite created.
    managed: true,
    role: container.role,
    image: container.image,
    state: container.state,
    startedAt: container.startedAt,
    stateChangedAt: container.stateChangedAt,
    cpuPercent: container.cpuPercent,
    memoryMb: container.memoryMb,
    ports: container.ports.map((port) => ({ host: port.host, container: port.container, protocol: port.protocol })),
    command: container.command,
    restartPolicy: container.restartPolicy,
  }
}

export function toDomainDTO(domain: Domain): DomainDTO {
  const tls: DomainDTO["tls"] =
    domain.ssl === "simulated-active" ? { status: "active", simulated: true } : { status: domain.ssl, simulated: false }
  return {
    id: domain.id,
    hostname: domain.name,
    kind: domain.kind,
    projectId: domain.projectId,
    targetPort: domain.targetPort,
    status: domain.status,
    tls,
    records: domain.records.map((record) => ({ type: record.type, host: record.host, value: record.value, purpose: record.purpose })),
    error: domain.error,
    createdAt: domain.createdAt,
    verifiedAt: domain.verifiedAt,
  }
}

export function toActivityDTO(event: ActivityEvent): ActivityDTO {
  return {
    id: event.id,
    action: event.action,
    result: event.result,
    objectType: event.objectType,
    objectName: event.objectName,
    href: event.href,
    actor: event.actor,
    timestamp: event.timestamp,
    detail: event.detail,
  }
}

const LOG_CATEGORY: Record<LogEntry["targetType"], LogEntryDTO["category"]> = {
  deployment: "build",
  project: "runtime",
  container: "runtime",
  server: "system",
}

/** `redacted` reports whether secret masking was applied to the batch this line came from. */
export function toLogEntryDTO(entry: LogEntry, options: { redacted: boolean }): LogEntryDTO {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    category: LOG_CATEGORY[entry.targetType],
    target: { type: entry.targetType, id: entry.targetId },
    projectId: entry.projectId,
    deploymentId: entry.targetType === "deployment" ? entry.targetId : null,
    containerId: entry.targetType === "container" ? entry.targetId : null,
    message: entry.message,
    redacted: options.redacted,
  }
}

/** One mock sample per hour, newest last. */
export const MOCK_METRIC_RESOLUTION_SECONDS = 3600

/**
 * The mock's series are plain arrays; the contract wants timestamped samples. The mock
 * has no sample times, so they are assigned backwards from `now` at the stated resolution.
 */
export function toServerMetricsDTO(serverId: string, metrics: ServerMetrics, now: number): ServerMetricsDTO {
  const stamp = (values: number[]) =>
    values.map((value, index) => ({
      t: new Date(now - (values.length - 1 - index) * MOCK_METRIC_RESOLUTION_SECONDS * 1000).toISOString(),
      v: value,
    }))
  return {
    serverId,
    available: metrics.available,
    reason: metrics.reason,
    current: {
      cpuPercent: metrics.cpu,
      memoryUsedGb: metrics.memoryUsedGb,
      memoryTotalGb: metrics.memoryTotalGb,
      storageUsedGb: metrics.storageUsedGb,
      storageTotalGb: metrics.storageTotalGb,
      networkMbps: metrics.networkMbps,
    },
    containers: { total: metrics.containerCount, running: metrics.runningContainers },
    readyDeployments: metrics.deploymentCount,
    resolutionSeconds: MOCK_METRIC_RESOLUTION_SECONDS,
    series: {
      cpu: stamp(metrics.series.cpu),
      memory: stamp(metrics.series.memory),
      disk: stamp(metrics.series.disk),
      network: stamp(metrics.series.network),
    },
  }
}
