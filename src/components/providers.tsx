"use client"

import * as Tooltip from "@radix-ui/react-tooltip"
import { MotionConfig } from "motion/react"
import { DeployProvider, useDeployState } from "@/lib/deploy/react"
import { ToastProvider } from "./ui/toast"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DeployProvider>
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
