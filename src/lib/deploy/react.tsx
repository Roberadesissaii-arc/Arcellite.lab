"use client"

import { createContext, useContext, useEffect, useSyncExternalStore } from "react"
import { mockDeployProvider } from "./mock-provider"
import type { DeployProvider as DeployProviderContract } from "./provider"
import type { AppState, Deployment, LogEntry, LogQuery, ProjectHealth, ServerMetrics } from "./types"

const DeployContext = createContext<DeployProviderContract>(mockDeployProvider)

/**
 * Supplies the deploy provider to the tree and, unless `autoStart` is false, runs its
 * lifecycle (storage load, streams). The server provider starts only inside signed-in
 * pages, through `DeployLifecycle`, so /login and /setup never request workspace data.
 */
export function DeployProvider({
  provider = mockDeployProvider,
  autoStart = true,
  children,
}: {
  provider?: DeployProviderContract
  autoStart?: boolean
  children: React.ReactNode
}) {
  useEffect(() => (autoStart ? provider.start?.() : undefined), [provider, autoStart])
  return <DeployContext.Provider value={provider}>{children}</DeployContext.Provider>
}

/** Starts the provider while mounted. Starting is reference-counted by the provider. */
export function DeployLifecycle() {
  const provider = useDeploy()
  useEffect(() => provider.start?.(), [provider])
  return null
}

export function useDeploy(): DeployProviderContract {
  return useContext(DeployContext)
}

export function useDeployState(): AppState | null {
  const deploy = useDeploy()
  const ready = useSyncExternalStore(deploy.subscribe, deploy.isReady, () => false)
  const state = useSyncExternalStore(deploy.subscribe, deploy.getSnapshot, deploy.getServerSnapshot)
  return ready ? state : null
}

/*
 * Query hooks. Each re-renders when the provider's cache changes and re-reads on every
 * render, so a view that shows live progress keeps its own display interval. Views never
 * compute infrastructure state themselves; they only format what the provider reports.
 */

export function useDeployment(id: string | undefined): Deployment | null {
  const deploy = useDeploy()
  const state = useDeployState()
  return state && id ? deploy.deployment(id) : null
}

export function useDeploymentProgress(id: string | undefined): number {
  const deploy = useDeploy()
  const state = useDeployState()
  return state && id ? deploy.deploymentProgress(id) : 0
}

export function useDeployments(): Deployment[] {
  const deploy = useDeploy()
  const state = useDeployState()
  return state ? deploy.deployments() : []
}

/** A project's deployments, newest first; empty until the project is known. */
export function useProjectDeployments(projectId: string | undefined): Deployment[] {
  const deploy = useDeploy()
  const state = useDeployState()
  return state && projectId ? deploy.deployments({ projectId }) : []
}

export function useLiveDeployment(projectId: string | undefined): Deployment | null {
  const deploy = useDeploy()
  const state = useDeployState()
  return state && projectId ? deploy.liveDeployment(projectId) : null
}

export function useLogs(query: LogQuery): LogEntry[] {
  const deploy = useDeploy()
  const state = useDeployState()
  return state ? deploy.logs(query) : []
}

export function useServerMetrics(serverId: string | undefined): ServerMetrics | null {
  const deploy = useDeploy()
  const state = useDeployState()
  return state && serverId ? deploy.metrics(serverId) : null
}

export function useProjectHealth(projectId: string | undefined): ProjectHealth | null {
  const deploy = useDeploy()
  const state = useDeployState()
  return state && projectId ? deploy.projectHealth(projectId) : null
}
