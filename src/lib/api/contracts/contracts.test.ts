import { describe, expect, it } from "vitest"
import { FRAMEWORKS as FRAMEWORK_PROFILES } from "@/lib/deploy/detect"
import {
  toActivityDTO,
  toContainerDTO,
  toDeploymentDTO,
  toDomainDTO,
  toEnvVarDTO,
  toLogEntryDTO,
  toProjectDTO,
  toServerDTO,
  toServerMetricsDTO,
} from "@/lib/deploy/dto"
import { createInitialState } from "@/lib/deploy/fixtures"
import { serverMetrics } from "@/lib/deploy/helpers"
import { collectLogs } from "@/lib/deploy/logs"
import type { Project } from "@/lib/deploy/types"
import {
  ActivityDtoSchema,
  ContainerDtoSchema,
  DeploymentDtoSchema,
  DomainDtoSchema,
  EnvVarDtoSchema,
  EnvVarWriteSchema,
  FRAMEWORKS,
  LogEntryDtoSchema,
  LogQuerySchema,
  ProjectDtoSchema,
  ServerDtoSchema,
  ServerMetricsDtoSchema,
} from "./index"

const NOW = Date.parse("2026-03-02T12:00:00.000Z")
const demo = createInitialState(NOW)
const DEMO_SECRETS = demo.projects.flatMap((project) => project.env.filter((variable) => variable.secret).map((variable) => variable.value))
const DEMO_DB_PASSWORDS = demo.databases.flatMap((database) => (database.password ? [database.password] : []))

function withSecret(): Project {
  return {
    ...demo.projects[0],
    simulateFailure: true,
    env: [{ id: "env_token", key: "SECRET_TOKEN", value: "super-secret-value", secret: true, scope: "all" }],
  }
}

describe("DTO adapters produce valid contracts", () => {
  it("maps every demo record", () => {
    for (const project of demo.projects) expect(ProjectDtoSchema.parse(toProjectDTO(project))).toBeTruthy()
    for (const deployment of demo.deployments) expect(DeploymentDtoSchema.parse(toDeploymentDTO(deployment))).toBeTruthy()
    for (const server of demo.servers) expect(ServerDtoSchema.parse(toServerDTO(server))).toBeTruthy()
    for (const container of demo.containers) expect(ContainerDtoSchema.parse(toContainerDTO(container))).toBeTruthy()
    for (const domain of demo.domains) expect(DomainDtoSchema.parse(toDomainDTO(domain))).toBeTruthy()
    for (const event of demo.activity) expect(ActivityDtoSchema.parse(toActivityDTO(event))).toBeTruthy()
    for (const variable of demo.projects.flatMap((project) => project.env)) expect(EnvVarDtoSchema.parse(toEnvVarDTO(variable))).toBeTruthy()
    const lines = collectLogs(demo, { target: "all" }, NOW)
    for (const line of lines) expect(LogEntryDtoSchema.parse(toLogEntryDTO(line, { redacted: true }))).toBeTruthy()
    const server = demo.servers[0]
    expect(ServerMetricsDtoSchema.parse(toServerMetricsDTO(server.id, serverMetrics(server, demo), NOW))).toBeTruthy()
  })

  it("timestamps metric samples oldest first, ending now", () => {
    const server = demo.servers[0]
    const dto = toServerMetricsDTO(server.id, serverMetrics(server, demo), NOW)
    const times = dto.series.cpu.map((sample) => Date.parse(sample.t))
    expect(times.at(-1)).toBe(NOW)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it("reports simulated certificates as simulated", () => {
    const domain = { ...demo.domains[0], ssl: "simulated-active" as const }
    expect(toDomainDTO(domain).tls).toEqual({ status: "active", simulated: true })
  })

  it("never reports a project that has not been released as running", () => {
    const fresh: Project = { ...demo.projects[0], runtime: "running", liveDeploymentId: null }
    expect(toProjectDTO(fresh).runtimeState).toBe("not-deployed")
  })
})

describe("secrets stay out of safe DTOs", () => {
  it("does not serialize an environment secret in a project", () => {
    const json = JSON.stringify(toProjectDTO(withSecret()))
    expect(json).not.toContain("super-secret-value")
    expect(json).not.toContain("SECRET_TOKEN")
  })

  it("does not serialize a secret value in an environment variable", () => {
    const dto = toEnvVarDTO(withSecret().env[0])
    expect(dto).toEqual({ id: "env_token", key: "SECRET_TOKEN", scope: "all", secret: true, hasValue: true })
    expect(JSON.stringify(dto)).not.toContain("super-secret-value")
  })

  it("keeps every demo secret and database password out of the mapped workspace", () => {
    // Databases have no DTO yet; they stay in the mock model until the next migration.
    const json = JSON.stringify({
      projects: demo.projects.map(toProjectDTO),
      env: demo.projects.flatMap((project) => project.env.map(toEnvVarDTO)),
      deployments: demo.deployments.map(toDeploymentDTO),
      servers: demo.servers.map(toServerDTO),
      containers: demo.containers.map(toContainerDTO),
      domains: demo.domains.map(toDomainDTO),
    })
    expect(DEMO_SECRETS.length).toBeGreaterThan(0)
    for (const secret of [...DEMO_SECRETS, ...DEMO_DB_PASSWORDS]) expect(json).not.toContain(secret)
  })

  it("rejects a secret variable that carries its value", () => {
    const leaked = { id: "env_1", key: "API_KEY", scope: "all", secret: true, hasValue: true, value: "plaintext" }
    expect(EnvVarDtoSchema.safeParse(leaked).success).toBe(false)
  })

  it("accepts a secret variable without a value", () => {
    expect(EnvVarDtoSchema.safeParse({ id: "env_1", key: "API_KEY", scope: "production", secret: true, hasValue: true }).success).toBe(true)
  })
})

describe("mock-only fields are not part of the contracts", () => {
  it("rejects simulation and internal fields", () => {
    const project = toProjectDTO(demo.projects[0])
    expect(ProjectDtoSchema.safeParse({ ...project, simulateFailure: true }).success).toBe(false)
    expect(ProjectDtoSchema.safeParse({ ...project, env: [] }).success).toBe(false)
    expect(ProjectDtoSchema.safeParse({ ...project, runtime: "running" }).success).toBe(false)
    expect(DeploymentDtoSchema.safeParse({ ...toDeploymentDTO(demo.deployments[0]), failAt: "building" }).success).toBe(false)
    expect(ServerDtoSchema.safeParse({ ...toServerDTO(demo.servers[0]), sampleShift: 2 }).success).toBe(false)
    expect(DomainDtoSchema.safeParse({ ...toDomainDTO(demo.domains[0]), failVerification: true }).success).toBe(false)
  })

  it("rejects obviously invalid shapes", () => {
    expect(ProjectDtoSchema.safeParse({ id: "proj_1" }).success).toBe(false)
    expect(DeploymentDtoSchema.safeParse({ ...toDeploymentDTO(demo.deployments[0]), status: "exploded" }).success).toBe(false)
    expect(ContainerDtoSchema.safeParse({ ...toContainerDTO(demo.containers[0]), ports: [{ host: 70000, container: 80, protocol: "tcp" }] }).success).toBe(false)
    expect(LogQuerySchema.safeParse({ target: "all", limit: 5000 }).success).toBe(false)
  })
})

describe("environment writes", () => {
  it("requires a value to create and preserves the stored value when omitted on update", () => {
    expect(EnvVarWriteSchema.safeParse({ key: "API_KEY", scope: "all", secret: true }).success).toBe(false)
    expect(EnvVarWriteSchema.safeParse({ key: "API_KEY", scope: "all", secret: true, value: "new" }).success).toBe(true)
    expect(EnvVarWriteSchema.safeParse({ id: "env_1", key: "API_KEY", scope: "all", secret: true }).success).toBe(true)
  })

  it("validates variable names like the editor does", () => {
    expect(EnvVarWriteSchema.safeParse({ key: "lower-case", scope: "all", secret: false, value: "x" }).success).toBe(false)
  })
})

describe("shared vocabulary", () => {
  it("has a framework profile for every contract framework", () => {
    expect(Object.keys(FRAMEWORK_PROFILES).sort()).toEqual([...FRAMEWORKS].sort())
  })
})
