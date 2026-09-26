"use client"

import { createContext, useContext, useEffect, useSyncExternalStore } from "react"
import { mockDeployProvider } from "./mock-provider"
import type { DeployProvider } from "./provider"
import { bootStore } from "./store"
import type { AppState } from "./types"

const DeployContext = createContext<DeployProvider>(mockDeployProvider)

export function DeployProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => bootStore(), [])
  return <DeployContext.Provider value={mockDeployProvider}>{children}</DeployContext.Provider>
}

export function useDeploy(): DeployProvider {
  return useContext(DeployContext)
}

export function useDeployState(): AppState | null {
  const deploy = useDeploy()
  const ready = useSyncExternalStore(deploy.subscribe, deploy.isReady, () => false)
  const state = useSyncExternalStore(deploy.subscribe, deploy.getSnapshot, deploy.getServerSnapshot)
  return ready ? state : null
}
