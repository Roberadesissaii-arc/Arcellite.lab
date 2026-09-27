"use client"

import * as Tooltip from "@radix-ui/react-tooltip"
import { MotionConfig } from "motion/react"
import { useEffect, useState } from "react"
import { mockDeployProvider } from "@/lib/deploy/mock-provider"
import { DeployProvider, useDeployState } from "@/lib/deploy/react"
import { createServerDeployProvider } from "@/lib/deploy/server-provider"
import { DeployError } from "@/lib/deploy/types"
import { ToastProvider, useToast } from "./ui/toast"

/** `mode` comes from ARCELLITE_PROVIDER on the server; the browser never chooses it. */
export function Providers({ mode, children }: { mode: "mock" | "server"; children: React.ReactNode }) {
  const [provider] = useState(() => (mode === "server" ? createServerDeployProvider({ documentPrefs: true }) : mockDeployProvider))
  return (
    <DeployProvider provider={provider} autoStart={mode === "mock"}>
      <ToastProvider>
        <UnhandledDeployErrors />
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

/**
 * A provider command that rejects where the caller only handled success (for example an
 * infrastructure action the control plane does not offer yet) still reaches the person as a
 * toast instead of failing silently.
 */
function UnhandledDeployErrors() {
  const toast = useToast()
  useEffect(() => {
    function onRejection(event: PromiseRejectionEvent) {
      if (!(event.reason instanceof DeployError)) return
      event.preventDefault()
      toast({ title: event.reason.title, description: event.reason.detail, tone: "danger" })
    }
    window.addEventListener("unhandledrejection", onRejection)
    return () => window.removeEventListener("unhandledrejection", onRejection)
  }, [toast])
  return null
}
