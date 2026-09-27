"use client"

import * as Tooltip from "@radix-ui/react-tooltip"
import { MotionConfig } from "motion/react"
import { useState } from "react"
import { mockDeployProvider } from "@/lib/deploy/mock-provider"
import { DeployProvider, useDeployState } from "@/lib/deploy/react"
import { createServerDeployProvider } from "@/lib/deploy/server-provider"
import { ToastProvider } from "./ui/toast"

/** `mode` comes from ARCELLITE_PROVIDER on the server; the browser never chooses it. */
export function Providers({ mode, children }: { mode: "mock" | "server"; children: React.ReactNode }) {
  const [provider] = useState(() => (mode === "server" ? createServerDeployProvider({ documentPrefs: true }) : mockDeployProvider))
  return (
    <DeployProvider provider={provider} autoStart={mode === "mock"}>
      <ToastProvider>
        <MotionBridge>{children}</MotionBridge>
      </ToastProvider>
    </DeployProvider>
  )
}

function MotionBridge({ children }: { children: React.ReactNode }) {
  const state = useDeployState()
  const choice = state?.settings.motion ?? "system"
  const reducedMotion = choice === "reduce" ? "always" : choice === "full" ? "never" : "user"
  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <Tooltip.Provider delayDuration={80}>{children}</Tooltip.Provider>
    </MotionConfig>
  )
}
