import { describe, expect, it } from "vitest"
import { ApiErrorSchema } from "@/lib/api/contracts/error"
import { toApiError } from "./errors"
import type { DeployProvider } from "./provider"
import { isTerminalStatus } from "./status"
import { type CreateProjectInput, DeployError } from "./types"

/**
 * A provider under test plus the controls only a test needs. `advance` moves the
 * provider's notion of time forward and lets it process whatever that time produced;
 * for a server provider it waits for the next events instead.
 */
export interface DeployProviderHarness {
  provider: DeployProvider
  /** An enrolled, online server to deploy onto. */
  serverId: string
  advance(ms: number): Promise<void>
}

/** Longer than any deployment the contract starts is allowed to take. */
export const DEPLOY_SETTLE_MS = 60_000

let nextPort = 9000

export function projectInput(name: string, overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
  return {
    name,
    environment: "production",
    framework: "dockerfile",
    source: { type: "image", image: "nginx:alpine" },
    branch: null,
    rootDirectory: ".",
    packageManager: null,
    installCommand: "",
    buildCommand: "",
    startCommand: "nginx -g 'daemon off;'",
    outputDirectory: null,
    internalPort: 80,
    exposedPort: nextPort++,
    portMode: "custom",
    healthPath: "/",
    autoDeploy: false,
    cpuLimit: null,
    memoryLimitMb: null,
    restartPolicy: "unless-stopped",
    env: [],
    ...overrides,
  }
}

async function rejection(promise: Promise<unknown>): Promise<DeployError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof DeployError) return error
    throw error
  }
  throw new Error("Expected the call to reject")
}

/**
 * Behavior every DeployProvider must share so feature UI can switch implementations.
 * The suite uses only the public contract: no store internals and no `dev` tools.
 */
export function defineDeployProviderContract(name: string, createHarness: () => DeployProviderHarness) {
  describe(`DeployProvider contract: ${name}`, () => {
    describe("readiness", () => {
      it("is ready with a readable snapshot and declared capabilities", () => {
        const { provider } = createHarness()
        expect(provider.isReady()).toBe(true)
        expect(Array.isArray(provider.getSnapshot().projects)).toBe(true)
        expect(["mock", "server"]).toContain(provider.capabilities.mode)
      })
    })

    describe("projects", () => {
      it("creates, reads, updates, and deletes a project", async () => {
        const { provider } = createHarness()
        const project = await provider.createProject(projectInput("Contract app"))
        expect(provider.getSnapshot().projects.some((item) => item.id === project.id)).toBe(true)

        const renamed = await provider.updateProject(project.id, { name: "Contract app 2" })
        expect(renamed.name).toBe("Contract app 2")
        expect(provider.getSnapshot().projects.find((item) => item.id === project.id)?.name).toBe("Contract app 2")

        await provider.deleteProject(project.id)
        expect(provider.getSnapshot().projects.some((item) => item.id === project.id)).toBe(false)
      })

      it("rejects invalid input with a structured, serializable error", async () => {
        const { provider } = createHarness()
        const error = await rejection(provider.createProject(projectInput("   ")))
        expect(error.code).toBe("VALIDATION_FAILED")
        const apiError = toApiError(error)
        expect(ApiErrorSchema.safeParse(apiError).success).toBe(true)
        expect(JSON.stringify(apiError)).not.toContain("stack")
      })

      it("reports a missing project as NOT_FOUND", async () => {
        const { provider } = createHarness()
        const error = await rejection(provider.startDeployment("proj_missing"))
        expect(error.code).toBe("NOT_FOUND")
      })

      it("stores environment variables with the project", async () => {
        const { provider } = createHarness()
        const project = await provider.createProject(projectInput("Env app"))
        await provider.updateProject(project.id, {
          env: [{ id: "env_contract", key: "API_TOKEN", value: "contract-secret", secret: true, scope: "all" }],
        })
        const stored = provider.getSnapshot().projects.find((item) => item.id === project.id)
        expect(stored?.env.map((variable) => [variable.key, variable.secret])).toEqual([["API_TOKEN", true]])
      })
    })

    describe("deployments", () => {
      it("starts a deployment that the provider carries to ready", async () => {
        const harness = createHarness()
        const { provider } = harness
        const project = await provider.createProject(projectInput("Ready app"))
        const started = await provider.startDeployment(project.id)
        expect(isTerminalStatus(provider.deployment(started.id)?.status ?? "failed")).toBe(false)

        await harness.advance(DEPLOY_SETTLE_MS)
        const finished = provider.deployment(started.id)
        expect(finished?.status).toBe("ready")
        expect(provider.deploymentProgress(started.id)).toBe(1)
        expect(provider.latestDeployment(project.id)?.id).toBe(started.id)
        expect(provider.liveDeployment(project.id)?.id).toBe(started.id)
        expect(provider.deployments({ projectId: project.id }).map((item) => item.id)).toEqual([started.id])
      })

      it("creates one deployment for a repeated idempotency key", async () => {
        const { provider } = createHarness()
        const project = await provider.createProject(projectInput("Double click"))
        const [first, second] = await Promise.all([
          provider.startDeployment(project.id, { idempotencyKey: "abc" }),
          provider.startDeployment(project.id, { idempotencyKey: "abc" }),
        ])
        expect(second.id).toBe(first.id)
        expect(provider.deployments({ projectId: project.id })).toHaveLength(1)
      })

      it("creates separate deployments for different keys", async () => {
        const { provider } = createHarness()
        const project = await provider.createProject(projectInput("Two keys"))
        const first = await provider.startDeployment(project.id, { idempotencyKey: "key-1" })
        const second = await provider.startDeployment(project.id, { idempotencyKey: "key-2" })
        expect(second.id).not.toBe(first.id)
        expect(provider.deployments({ projectId: project.id })).toHaveLength(2)
      })

      it("does not let one operation's key answer for another operation", async () => {
        const { provider } = createHarness()
        const project = await provider.createProject(projectInput("Shared key"))
        const started = await provider.startDeployment(project.id, { idempotencyKey: "shared" })
        const redeployed = await provider.redeploy(project.id, { idempotencyKey: "shared" })
        expect(redeployed.id).not.toBe(started.id)
      })

      it("rejects a reused key with different arguments", async () => {
        const { provider } = createHarness()
        const first = await provider.createProject(projectInput("First"))
        const other = await provider.createProject(projectInput("Other"))
        await provider.startDeployment(first.id, { idempotencyKey: "same-key" })
        const error = await rejection(provider.startDeployment(other.id, { idempotencyKey: "same-key" }))
        expect(error.code).toBe("IDEMPOTENCY_CONFLICT")
        expect(provider.deployments({ projectId: other.id })).toHaveLength(0)
      })

      it("cancels an in-flight deployment and keeps it canceled", async () => {
        const harness = createHarness()
        const { provider } = harness
        const project = await provider.createProject(projectInput("Cancel app"))
        const started = await provider.startDeployment(project.id)
        await harness.advance(1_000)
        const canceled = await provider.cancelDeployment(started.id)
        expect(canceled.status).toBe("canceled")

        await harness.advance(DEPLOY_SETTLE_MS)
        expect(provider.deployment(started.id)?.status).toBe("canceled")
        expect(provider.liveDeployment(project.id)).toBeNull()
      })

      it("redeploys as a new deployment", async () => {
        const harness = createHarness()
        const { provider } = harness
        const project = await provider.createProject(projectInput("Redeploy app"))
        const first = await provider.startDeployment(project.id)
        await harness.advance(DEPLOY_SETTLE_MS)
        const second = await provider.redeploy(project.id)
        expect(second.id).not.toBe(first.id)
        expect(provider.latestDeployment(project.id)?.id).toBe(second.id)
      })
    })

    describe("logs", () => {
      it("returns deployment lines and honours level and search filters", async () => {
        const harness = createHarness()
        const { provider } = harness
        const project = await provider.createProject(projectInput("Log app"))
        const deployment = await provider.startDeployment(project.id)
        await harness.advance(DEPLOY_SETTLE_MS)

        const lines = provider.logs({ target: "deployment", id: deployment.id })
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) {
          expect(line.targetId).toBe(deployment.id)
          expect(["info", "warn", "error", "debug"]).toContain(line.level)
          expect(Number.isNaN(Date.parse(line.timestamp))).toBe(false)
        }
        expect(provider.logs({ target: "deployment", id: deployment.id, level: "debug" }).every((line) => line.level === "debug")).toBe(true)
        const searched = provider.logs({ target: "deployment", id: deployment.id, search: "health check passed" })
        expect(searched.length).toBeGreaterThan(0)
        expect(searched.every((line) => line.message.toLowerCase().includes("health check passed"))).toBe(true)
      })
    })

    describe("metrics and health", () => {
      it("reports server metrics and nothing for an unknown server", () => {
        const { provider, serverId } = createHarness()
        const metrics = provider.metrics(serverId)
        expect(metrics?.available).toBe(true)
        expect(metrics?.memoryTotalGb).toBeGreaterThan(0)
        expect(Array.isArray(metrics?.series.cpu)).toBe(true)
        expect(provider.metrics("srv_missing")).toBeNull()
      })

      it("reports a released project as up", async () => {
        const harness = createHarness()
        const { provider } = harness
        const project = await provider.createProject(projectInput("Healthy app"))
        await provider.startDeployment(project.id)
        await harness.advance(DEPLOY_SETTLE_MS)
        expect(provider.projectHealth(project.id)?.health).toBe("up")
        expect(provider.projectHealth("proj_missing")).toBeNull()
      })
    })
  })
}
