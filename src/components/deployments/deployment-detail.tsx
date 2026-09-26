"use client"

import { Check, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { copyText, EmptyState, PageSkeleton } from "@/components/ui/bits"
import { useToast } from "@/components/ui/toast"
import { LogStream } from "@/components/logs/log-stream"
import { deploymentFraction, materializeDeployment } from "@/lib/deploy/engine"
import { formatClock, formatDuration, formatRelative } from "@/lib/deploy/format"
import { projectEndpoint } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { DeployError } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"
import { DeploymentStatusView } from "@/components/ui/status"

export function DeploymentDetail() {
  const params = useParams<{ deploymentId: string }>()
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const router = useRouter()
  const stored = state?.deployments.find((item) => item.id === params.deploymentId)
  const live = stored ? !stored.finishedAt && stored.status !== "canceled" && stored.status !== "failed" && stored.status !== "stopped" : false
  const now = useNow(live ? 200 : 30000)
  const [busy, setBusy] = useState<"cancel" | "redeploy" | null>(null)

  useEffect(() => {
    if (stored) document.title = `Deployment ${stored.commitSha} · Arcellite Deploy`
  }, [stored])

  if (!state) return <PageSkeleton />
  if (!stored) {
    return (
      <div className="page">
        <EmptyState title="Deployment not found" body="This release is not in the current workspace." />
      </div>
    )
  }
  const view = materializeDeployment(stored, now)
  const project = state.projects.find((item) => item.id === stored.projectId)
  const fraction = deploymentFraction(view, now)
  const endpoint = project ? projectEndpoint(project, state.servers[0]?.ip) : ""
  const sourceUrl = project?.source.type === "github" ? `https://github.com/${project.source.fullName}/commit/${view.commitSha}` : null
  const terminal = view.status === "ready" || view.status === "failed" || view.status === "canceled" || view.status === "stopped"

  return (
    <div className="page page-wide">
      <p className="page-kicker">{project ? <Link href={`/projects/${project.id}`}>{project.name}</Link> : "Deployment"} · {view.environment}</p>
      <div className="page-introduction mt-2">
        <div>
          <h1 className="page-title">{view.commitMessage}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <DeploymentStatusView value={view.status} />
            <span className="font-mono text-sm text-muted">{view.commitSha}</span>
            <span className="text-sm text-faint">{formatRelative(view.createdAt, now)} · {view.triggeredBy}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void copyText(view.id).then((ok) => toast(ok ? { title: "Deployment ID copied" } : { title: "Could not copy", tone: "danger" }))}>Copy ID</Button>
          {sourceUrl ? <a className="btn btn-secondary" href={sourceUrl} target="_blank" rel="noreferrer">Source commit <ExternalLink aria-hidden /></a> : null}
          {!terminal ? (
            <Button
              variant="danger"
              loading={busy === "cancel"}
              onClick={() => {
                setBusy("cancel")
                void deploy.cancelDeployment(view.id).then(
                  () => {
                    toast({ title: "Deployment canceled" })
                    setBusy(null)
                  },
                  (error: unknown) => {
                    setBusy(null)
                    if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
                  },
                )
              }}
            >
              Cancel
            </Button>
          ) : project ? (
            <Button
              variant="primary"
              loading={busy === "redeploy"}
              onClick={() => {
                setBusy("redeploy")
                void deploy.redeploy(project.id).then(
                  (next) => {
                    toast({ title: "Redeploy started" })
                    router.push(`/deployments/${next.id}`)
                  },
                  (error: unknown) => {
                    setBusy(null)
                    if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
                  },
                )
              }}
            >
              Redeploy
            </Button>
          ) : null}
          {view.status === "ready" && endpoint ? (
            <a className="btn btn-primary" href={endpoint} target="_blank" rel="noreferrer">Visit <ExternalLink aria-hidden /></a>
          ) : null}
        </div>
      </div>

      {view.error ? (
        <section className="mt-8 max-w-2xl">
          <h2 className="text-[15px] font-semibold text-[var(--status-danger)]">{view.error.title}</h2>
          <p className="mt-2 text-sm">{view.error.detail}</p>
          <p className="mt-2 text-sm text-muted">{view.error.affects}</p>
          <p className="mt-2 text-sm">{view.error.action}</p>
        </section>
      ) : null}

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <section className="panel self-start p-5">
          <div className="mb-3 flex items-center justify-between text-sm text-muted">
            <span>{terminal ? "Finished" : "In progress"}</span>
            <span className="tabular-nums">{view.finishedAt ? formatDuration(Date.parse(view.finishedAt) - Date.parse(view.createdAt)) : `${Math.round(fraction * 100)}%`}</span>
          </div>
          <div className="meter" aria-label="Deployment progress" role="progressbar" aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${fraction * 100}%` }} />
          </div>
          <ol className="mt-5">
            {view.steps.map((step) => (
              <li key={step.phase} className="grid grid-cols-[16px_1fr_auto] gap-3 border-b border-[var(--border-subtle)] py-3 text-sm">
                <span aria-hidden className={step.status === "completed" ? "text-[var(--status-success)]" : step.status === "failed" || step.status === "canceled" ? "text-[var(--status-danger)]" : "text-faint"}>
                  {step.status === "completed" ? <Check className="h-4 w-4" /> : step.status === "active" ? "•" : step.status === "failed" ? "!" : "○"}
                </span>
                <span>
                  <span className={step.status === "pending" ? "text-faint" : "font-medium"}>{step.label}</span>
                  {step.status === "active" ? <span className="ml-2 text-xs text-muted">Running</span> : null}
                </span>
                <span className="text-xs text-faint tabular-nums">{step.finishedAt ? formatClock(step.finishedAt) : step.startedAt ? formatClock(step.startedAt) : ""}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Logs</h2>
          <LogStream target="deployment" id={view.id} />
        </section>
      </div>
    </div>
  )
}
