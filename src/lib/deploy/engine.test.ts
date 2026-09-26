import { describe, expect, it } from "vitest"
import { analysisFromFiles, detectFramework } from "./detect"
import {
  FAIL_RATIO,
  PIPELINE,
  cancelDeployment,
  concludeDeployment,
  deploymentFraction,
  materializeDeployment,
  totalDurationMs,
} from "./engine"
import { filterDeployments, filterProjects } from "./filters"
import { formatBytes, formatRelative } from "./format"
import { classifyHostname, nextFreePort, portTaken, redactMessage } from "./helpers"
import { deploymentLogs } from "./logs"
import type { Deployment, Project } from "./types"

function offset(phase: (typeof PIPELINE)[number]["phase"]): number {
  let cursor = 0
  for (const item of PIPELINE) {
    if (item.phase === phase) return cursor
    cursor += item.ms
  }
  return cursor
}

function project(partial: Partial<Project> = {}): Project {
  return {
    id: "proj_test",
    name: "Arciin",
    slug: "arciin",
    environment: "production",
    framework: "nextjs",
    source: { type: "github", owner: "Roberadesissaii", repo: "arciin", fullName: "Roberadesissaii/arciin" },
    branch: "main",
    commitSha: null,
    commitMessage: null,
    packageManager: "pnpm",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
    outputDirectory: ".next",
    rootDirectory: ".",
    internalPort: 3000,
    exposedPort: 8082,
    portMode: "auto",
    healthPath: "/",
    restartPolicy: "unless-stopped",
    cpuLimit: null,
    memoryLimitMb: null,
    autoDeploy: true,
    hostname: "arciin.local",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    runtime: "running",
    simulateFailure: false,
    env: [],
    liveDeploymentId: null,
    ...partial,
  }
}

function draft(partial: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep_test",
    projectId: "proj_test",
    environment: "production",
    status: "queued",
    phase: "queued",
    steps: [],
    branch: "main",
    commitSha: "8f34a91",
    commitMessage: "Deploy dashboard redesign",
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
    triggeredBy: "Robera",
    failAt: null,
    previousRelease: true,
    error: null,
    sourceLabel: "Roberadesissaii/arciin · main",
    ...partial,
  }
}

describe("deployment engine", () => {
  const started = Date.parse("2026-01-01T00:00:00.000Z")

  it("walks the pipeline in order and finishes ready", () => {
    const queued = materializeDeployment(draft(), started + 10)
    expect(queued.status).toBe("queued")
    expect(queued.steps.find((step) => step.phase === "preparing")?.status).toBe("pending")

    const preparing = materializeDeployment(draft(), started + offset("preparing") + 20)
    expect(preparing.status).toBe("preparing")
    expect(preparing.steps.find((step) => step.phase === "preparing")?.status).toBe("active")

    const building = materializeDeployment(draft(), started + offset("building") + 20)
    expect(building.status).toBe("building")

    const ready = materializeDeployment(draft(), started + totalDurationMs())
    expect(ready.status).toBe("ready")
    expect(ready.phase).toBe("ready")
    expect(ready.finishedAt).toBeTruthy()
    expect(ready.steps.every((step) => step.status === "completed")).toBe(true)
    expect(deploymentFraction(ready, started + totalDurationMs())).toBe(1)

    const again = materializeDeployment(ready, started + totalDurationMs() + 50_000)
    expect(again).toBe(ready)
  })

  it("fails at the building phase when requested and keeps the previous release message", () => {
    const building = PIPELINE.find((phase) => phase.phase === "building")
    expect(building).toBeTruthy()
    const failAt = started + offset("building") + Math.floor((building?.ms ?? 0) * FAIL_RATIO)
    const before = materializeDeployment(draft({ failAt: "building" }), failAt - 30)
    expect(before.status).toBe("building")

    const failed = materializeDeployment(draft({ failAt: "building" }), failAt)
    expect(failed.status).toBe("failed")
    expect(failed.error?.title).toBe("Build failed")
    expect(failed.error?.affects).toContain("previous release")
    expect(failed.steps.find((step) => step.phase === "building")?.status).toBe("failed")
    expect(failed.steps.find((step) => step.phase === "ready")?.status).toBe("pending")

    const first = materializeDeployment(draft({ failAt: "building", previousRelease: false }), failAt)
    expect(first.error?.affects).toContain("Nothing is serving")
  })

  it("cancels an in-flight deployment without continuing", () => {
    const live = materializeDeployment(draft(), started + offset("installing") + 100)
    const canceled = cancelDeployment(live, started + offset("installing") + 120)
    expect(canceled.status).toBe("canceled")
    expect(materializeDeployment(canceled, started + totalDurationMs() + 1000).status).toBe("canceled")
    expect(canceled.steps.some((step) => step.status === "canceled")).toBe(true)
  })

  it("writes stage logs and omits the success line when the build fails", () => {
    const ready = concludeDeployment(draft())
    const logs = deploymentLogs(ready, project(), Date.parse(ready.finishedAt ?? ready.startedAt))
    expect(logs.map((entry) => entry.message)).toContain("Deployment ready")
    expect(logs.map((entry) => entry.message).some((message) => message.includes("Cloning"))).toBe(true)

    const building = PIPELINE.find((phase) => phase.phase === "building")
    const failAt = started + offset("building") + Math.floor((building?.ms ?? 0) * FAIL_RATIO)
    const failed = materializeDeployment(draft({ failAt: "building" }), failAt + 10)
    const failedLogs = deploymentLogs(failed, project(), failAt + 10)
    expect(failedLogs.some((entry) => entry.message === "Compiled successfully")).toBe(false)
    expect(failedLogs.some((entry) => entry.level === "error")).toBe(true)
  })
})

describe("framework detection", () => {
  it("recognizes the supported manifests", () => {
    expect(detectFramework(["package.json", "pnpm-lock.yaml", "next.config.ts", "app/page.tsx"]).framework).toBe("nextjs")
    expect(detectFramework(["package.json", "vite.config.ts", "index.html"]).framework).toBe("vite")
    expect(detectFramework(["package.json", "src/server.ts"]).framework).toBe("express")
    expect(detectFramework(["requirements.txt", "app/main.py"]).framework).toBe("fastapi")
    expect(detectFramework(["requirements.txt", "app.py"]).framework).toBe("flask")
    expect(detectFramework(["index.html", "styles.css"]).framework).toBe("static")
    expect(detectFramework(["Dockerfile", "app/server.js"]).framework).toBe("dockerfile")
    expect(detectFramework(["docker-compose.yml", "Dockerfile"]).framework).toBe("compose")
    expect(detectFramework(["README.md"]).failed).toBe(true)
  })

  it("describes a failed analysis without inventing commands", () => {
    const result = analysisFromFiles(["README.md"])
    expect(result.failed).toBe(true)
    expect(result.framework).toBe("unknown")
    expect(result.buildCommand).toBe("")
  })
})

describe("filters and helpers", () => {
  const projects = [
    project({ id: "a", name: "Arciin", updatedAt: "2026-03-02T00:00:00.000Z", environment: "production" }),
    project({
      id: "b",
      name: "API Sandbox",
      slug: "api-sandbox",
      updatedAt: "2026-03-03T00:00:00.000Z",
      environment: "development",
      framework: "fastapi",
      exposedPort: 8084,
    }),
  ]

  it("filters and sorts projects", () => {
    const status = (item: Project) => (item.id === "b" ? "building" : "ready")
    const found = filterProjects(projects, status, {
      search: "sandbox",
      environment: "all",
      status: "all",
      sort: "name",
    })
    expect(found.map((item) => item.id)).toEqual(["b"])
    const readyOnly = filterProjects(projects, status, {
      search: "",
      environment: "production",
      status: "ready",
      sort: "recent",
    })
    expect(readyOnly.map((item) => item.id)).toEqual(["a"])
  })

  it("filters deployments by status and commit", () => {
    const deployments = [
      draft({ id: "1", commitMessage: "Deploy dashboard redesign", status: "ready", phase: "ready", finishedAt: "2026-03-02T00:00:00.000Z" }),
      draft({ id: "2", projectId: "b", commitSha: "b10aa02", commitMessage: "First sandbox import", status: "failed", phase: "building", finishedAt: "2026-03-03T00:00:00.000Z", createdAt: "2026-03-03T00:00:00.000Z" }),
    ]
    const failed = filterDeployments(deployments, projects, {
      search: "b10aa02",
      projectId: "all",
      environment: "all",
      status: "failed",
    })
    expect(failed).toHaveLength(1)
  })

  it("allocates ports and classifies hostnames", () => {
    expect(nextFreePort(projects, 8082)).toBe(8083)
    expect(portTaken(projects, 8082)?.id).toBe("a")
    expect(classifyHostname("https://API.Sandbox.dev/docs")).toEqual({ name: "api.sandbox.dev", kind: "public" })
    const localName = classifyHostname("arciin.local")
    expect("kind" in localName && localName.kind).toBe("private")
    expect("error" in classifyHostname("192.168.1.50")).toBe(true)
    expect("error" in classifyHostname("not a host")).toBe(true)
  })

  it("formats relative time and redacts secrets", () => {
    const now = Date.parse("2026-03-01T12:00:00.000Z")
    expect(formatRelative(new Date(now - 18 * 60_000).toISOString(), now)).toBe("18 min ago")
    expect(formatRelative(new Date(now - 2 * 60 * 60_000).toISOString(), now)).toBe("2 hr ago")
    expect(formatRelative(new Date(now - 4_000).toISOString(), now)).toBe("just now")
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB")
    expect(redactMessage("checkpoint password=arc-lab-demo-password ok")).toBe("checkpoint password=•••••••• ok")
  })
})
