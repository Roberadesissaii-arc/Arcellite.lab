"use client"

import { useRouter } from "next/navigation"
import { Rocket, Server, Upload } from "lucide-react"
import { useState } from "react"
import { GitHubMark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/overlays"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { HOME_SERVER_ID } from "@/lib/deploy/helpers"

export function Onboarding() {
  const state = useDeployState()
  const deploy = useDeploy()
  const router = useRouter()
  const [step, setStep] = useState(0)
  if (!state || state.onboardingComplete) return null
  const server = state.servers.find((item) => item.id === HOME_SERVER_ID)

  async function finish(href?: string) {
    await deploy.completeOnboarding()
    if (href) router.push(href)
  }

  return (
    <Modal
      icon={step === 0 ? Rocket : step === 1 ? Server : Upload}
      open
      onOpenChange={(open) => {
        if (!open) void finish()
      }}
      title={step === 0 ? "Welcome to Arcellite Deploy" : step === 1 ? "Where should it run?" : "Deploy the first application"}
      description={
        step === 0
          ? "Deploy applications to infrastructure you control. This workspace is a demo of the control plane."
          : step === 1
            ? "Phase 1 uses the server already in this lab. Connecting another machine arrives with the agent."
            : "Bring a repository or an archive online. You can also skip and look around first."
      }
    >
      {step === 1 ? (
        <div className="space-y-2">
          <div className="choice" data-active="true">
            <div>
              <p className="font-semibold">{server?.name ?? "This server"}</p>
              <p className="text-sm text-muted">
                {server?.os} · {server?.ip}
              </p>
            </div>
          </div>
          <button type="button" className="choice w-full opacity-60" disabled>
            <div>
              <p className="font-semibold">Connect another server</p>
              <p className="text-sm text-muted">Coming later</p>
            </div>
          </button>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="grid gap-2">
          <button type="button" className="choice source-choice" onClick={() => void finish("/projects/new/github")}>
            <GitHubMark className="mt-0.5 h-5 w-5" />
            <span>
              <span className="block font-semibold">GitHub</span>
              <span className="text-sm text-muted">Import a repository from Roberadesissaii.</span>
            </span>
          </button>
          <button type="button" className="choice source-choice" onClick={() => void finish("/projects/new/upload")}>
            <Upload className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-semibold">Upload</span>
              <span className="text-sm text-muted">Use a project archive or a local folder.</span>
            </span>
          </button>
        </div>
      ) : null}
      <div className="dialog-actions" data-split>
        <button type="button" className="btn btn-ghost" onClick={() => void finish()}>
          Skip
        </button>
        {step < 2 ? (
          <Button variant="primary" onClick={() => setStep((value) => value + 1)}>
            Continue
          </Button>
        ) : null}
      </div>
    </Modal>
  )
}
