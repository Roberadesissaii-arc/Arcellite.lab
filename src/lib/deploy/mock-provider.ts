import { deploymentFraction, materializeDeployment } from "./engine"
import { projectHealth } from "./health"
import { latestDeployment, liveDeployment, serverMetrics } from "./helpers"
import { collectLogs } from "./logs"
import type { DeployProvider, DeployProviderCapabilities, MutationOptions } from "./provider"
import { browserMockStore, type MockStore } from "./store"
import { DeployError } from "./types"

export const MOCK_CAPABILITIES: DeployProviderCapabilities = {
  mode: "mock",
  realInfrastructure: false,
  realGitHub: false,
  realDomains: false,
  realMetrics: false,
  realLogs: false,
  secretReveal: true,
}

/** How many idempotency keys the mock remembers before forgetting the oldest. */
export const IDEMPOTENCY_LIMIT = 200

interface IdempotencyEntry {
  fingerprint: string
  result: unknown
}

/**
 * Simulates the server's idempotency contract: the same operation with the same key and
 * the same arguments returns the first result without repeating the effect. Reusing a
 * key with different arguments is a conflict. Failed attempts are not remembered, so a
 * retry after an error runs again.
 */
export function createIdempotencyRegistry(limit = IDEMPOTENCY_LIMIT) {
  const entries = new Map<string, IdempotencyEntry>()

  function run<T>(operation: string, args: readonly unknown[], key: string | undefined, execute: () => T): T {
    if (!key) return execute()
    const id = `${operation}\u0000${key}`
    const fingerprint = JSON.stringify(args)
    const hit = entries.get(id)
    if (hit) {
      if (hit.fingerprint !== fingerprint) {
        throw new DeployError("Request already used", "This request key was already used for a different change.", {
          code: "IDEMPOTENCY_CONFLICT",
        })
      }
      // Refresh recency so active keys outlive idle ones.
      entries.delete(id)
      entries.set(id, hit)
      // The entry was stored by this operation, so it holds this operation's result type.
      return hit.result as T
    }
    const result = execute()
    entries.set(id, { fingerprint, result })
    while (entries.size > limit) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
    return result
  }

  return { run, clear: () => entries.clear(), size: () => entries.size }
}

/** The Phase 1 provider: every effect stays in the given mock store, in the browser. */
export function createMockDeployProvider(store: MockStore): DeployProvider {
  const { actions } = store
  const idempotency = createIdempotencyRegistry()

  // Commands reject rather than throw, like a network provider would.
  function command<T>(operation: string, args: readonly unknown[], options: MutationOptions | undefined, execute: () => T): Promise<T> {
    try {
      return Promise.resolve(idempotency.run(operation, args, options?.idempotencyKey, execute))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  const state = () => store.getSnapshot()

  const provider: DeployProvider = {
    capabilities: MOCK_CAPABILITIES,
    dev: {
      resetDemo: () => command("dev.resetDemo", [], undefined, () => {
        actions.resetDemo()
        idempotency.clear()
      }),
      clearWorkspace: () => command("dev.clearWorkspace", [], undefined, () => {
        actions.clearWorkspace()
        idempotency.clear()
      }),
      setSimulateFailure: (projectId, value) => command("dev.setSimulateFailure", [projectId, value], undefined, () => {
        actions.setSimulateFailure(projectId, value)
      }),
      exportWorkspace: () => state(),
    },

    start: () => store.boot(),
    subscribe: store.subscribe,
    isReady: store.isReady,
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,

    // Mock-only materialization: a server provider reports deployment state from events.
    deployment(id) {
      const found = state().deployments.find((item) => item.id === id)
      return found ? materializeDeployment(found, store.clock()) : null
    },
    deploymentProgress(id) {
      const view = provider.deployment(id)
      return view ? deploymentFraction(view, store.clock()) : 0
    },
    deployments(filter = {}) {
      const now = store.clock()
      return state()
        .deployments.filter((item) => !filter.projectId || item.projectId === filter.projectId)
        .map((item) => materializeDeployment(item, now))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    },
    latestDeployment(projectId) {
      return latestDeployment(state().deployments, projectId, store.clock())
    },
    liveDeployment(projectId) {
      const current = state()
      const project = current.projects.find((item) => item.id === projectId)
      return project ? liveDeployment(current, project, store.clock()) : null
    },
    logs(query) {
      return collectLogs(state(), query, store.clock())
    },
    metrics(serverId) {
      const current = state()
      const server = current.servers.find((item) => item.id === serverId)
      return server ? serverMetrics(server, current) : null
    },
    projectHealth(projectId) {
      const current = state()
      const project = current.projects.find((item) => item.id === projectId)
      return project ? projectHealth(current, project, store.clock()) : null
    },

    createProject: (input, options) => command("createProject", [input], options, () => actions.createProject(input)),
    updateProject: (id, patch, options) => command("updateProject", [id, patch], options, () => actions.updateProject(id, patch)),
    deleteProject: (id, options) => command("deleteProject", [id], options, () => actions.deleteProject(id)),
    startDeployment: (projectId, options) => command("startDeployment", [projectId], options, () => actions.startDeployment(projectId)),
    cancelDeployment: (id, options) => command("cancelDeployment", [id], options, () => actions.cancelDeployment(id)),
    redeploy: (projectId, options) => command("redeploy", [projectId], options, () => actions.redeploy(projectId)),
    refreshServer: (id, options) => command("refreshServer", [id], options, () => actions.refreshServer(id)),
    restartAgent: (id, options) => command("restartAgent", [id], options, () => actions.restartAgent(id)),
    disconnectServer: (id, options) => command("disconnectServer", [id], options, () => actions.disconnectServer(id)),
    reconnectServer: (id, options) => command("reconnectServer", [id], options, () => actions.reconnectServer(id)),
    containerAction: (id, action, options) => command("containerAction", [id, action], options, () => actions.containerAction(id, action)),
    addDomain: (input, options) => command("addDomain", [input], options, () => actions.addDomain(input)),
    verifyDomain: (id, options) => command("verifyDomain", [id], options, () => actions.verifyDomain(id)),
    deleteDomain: (id, options) => command("deleteDomain", [id], options, () => actions.deleteDomain(id)),
    connectGitHub: (options) => command("connectGitHub", [], options, () => actions.connectGitHub()),
    disconnectGitHub: (options) => command("disconnectGitHub", [], options, () => actions.disconnectGitHub()),
    updateSettings: (patch, options) => command("updateSettings", [patch], options, () => actions.updateSettings(patch)),
    completeOnboarding: (options) => command("completeOnboarding", [], options, () => actions.completeOnboarding()),
  }
  return provider
}

/** The provider the browser app uses today. */
export const mockDeployProvider: DeployProvider = createMockDeployProvider(browserMockStore)
