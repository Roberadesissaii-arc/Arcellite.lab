import { describe, expect, it } from "vitest"
import { totalDurationMs } from "./engine"
import { createEmptyState } from "./fixtures"
import { HOME_SERVER_ID } from "./helpers"
import { createIdempotencyRegistry, createMockDeployProvider, mockDeployProvider } from "./mock-provider"
import { defineDeployProviderContract, DEPLOY_SETTLE_MS, projectInput, type DeployProviderHarness } from "./provider.contract"
import type { DeployProvider } from "./provider"
import { createMockStore } from "./store"

const START = Date.parse("2026-03-02T12:00:00.000Z")

/** An isolated mock workspace on a controllable clock; no real timers run. */
function mockHarness(): DeployProviderHarness & { store: ReturnType<typeof createMockStore> } {
  let now = START
  const store = createMockStore({ clock: () => now, initialState: createEmptyState(START) })
  return {
    store,
    provider: createMockDeployProvider(store),
    serverId: HOME_SERVER_ID,
    // Steps like the browser timer (200 ms) so every phase is observed, not skipped.
    async advance(ms) {
      for (let remaining = ms; remaining > 0; remaining -= 200) {
        now += Math.min(200, remaining)
        store.tick()
      }
    },
  }
}

/** The same mock with its dev tools removed: what a production provider looks like to the UI. */
function withoutDevTools(provider: DeployProvider): DeployProvider {
  return { ...provider, dev: undefined }
}

defineDeployProviderContract("mock", mockHarness)

defineDeployProviderContract("mock without dev tools", () => {
  const harness = mockHarness()
  return { ...harness, provider: withoutDevTools(harness.provider) }
})

describe("mock provider", () => {
  it("declares mock capabilities and exposes dev tools", () => {
    const { provider } = mockHarness()
    expect(provider.capabilities.mode).toBe("mock")
    expect(provider.capabilities.realInfrastructure).toBe(false)
    expect(provider.dev).toBeDefined()
    expect(mockDeployProvider.dev).toBeDefined()
  })

  it("keeps demo reset and workspace clear off the production contract", () => {
    const { provider } = mockHarness()
    expect("resetDemo" in provider).toBe(false)
    expect("clearWorkspace" in provider).toBe(false)
    expect(withoutDevTools(provider).dev).toBeUndefined()
  })

  it("fails the next deployment at the build step when failure is simulated", async () => {
    const harness = mockHarness()
    const { provider } = harness
    const project = await provider.createProject(projectInput("Failing app"))
    await provider.dev?.setSimulateFailure(project.id, true)
    const deployment = await provider.startDeployment(project.id)
    await harness.advance(totalDurationMs())
    const failed = provider.deployment(deployment.id)
    expect(failed?.status).toBe("failed")
    expect(failed?.phase).toBe("building")
    expect(provider.liveDeployment(project.id)).toBeNull()
  })

  it("forgets idempotency keys when the workspace is reset", async () => {
    const harness = mockHarness()
    const { provider } = harness
    await provider.dev?.clearWorkspace()
    const project = await provider.createProject(projectInput("After reset"))
    const first = await provider.startDeployment(project.id, { idempotencyKey: "reset-key" })
    await harness.advance(DEPLOY_SETTLE_MS)
    await provider.dev?.clearWorkspace()
    const again = await provider.createProject(projectInput("After second reset"))
    const second = await provider.startDeployment(again.id, { idempotencyKey: "reset-key" })
    expect(second.id).not.toBe(first.id)
  })

  it("loads the demo lab and exports the raw workspace through dev tools only", async () => {
    const { provider } = mockHarness()
    await provider.dev?.resetDemo()
    expect(provider.getSnapshot().projects.length).toBeGreaterThan(0)
    expect(provider.dev?.exportWorkspace().projects).toEqual(provider.getSnapshot().projects)
  })

  it("rejects instead of throwing synchronously", () => {
    const { provider } = mockHarness()
    let threw = false
    let promise: Promise<unknown> | undefined
    try {
      promise = provider.startDeployment("proj_missing")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    return expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("idempotency registry", () => {
  it("remembers a bounded number of keys and forgets the oldest", () => {
    const registry = createIdempotencyRegistry(3)
    let runs = 0
    const run = (key: string) => registry.run("op", [], key, () => ++runs)
    for (const key of ["a", "b", "c", "d", "e"]) run(key)
    expect(registry.size()).toBe(3)
    expect(run("e")).toBe(5)
    expect(runs).toBe(5)
    run("a")
    expect(runs).toBe(6)
  })

  it("does not remember failed attempts", () => {
    const registry = createIdempotencyRegistry()
    let attempts = 0
    const flaky = () => {
      attempts += 1
      if (attempts === 1) throw new Error("first attempt fails")
      return attempts
    }
    expect(() => registry.run("op", [], "retry", flaky)).toThrow()
    expect(registry.run("op", [], "retry", flaky)).toBe(2)
    expect(registry.run("op", [], "retry", flaky)).toBe(2)
  })

  it("runs every call when no key is given", () => {
    const registry = createIdempotencyRegistry()
    let runs = 0
    registry.run("op", [], undefined, () => ++runs)
    registry.run("op", [], undefined, () => ++runs)
    expect(runs).toBe(2)
    expect(registry.size()).toBe(0)
  })
})
