"use client"

import { AlertTriangle, Check, Copy, ExternalLink, Globe2, Loader2, Rocket, RotateCcw, X } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { copyText, EmptyState, PageSkeleton } from "@/components/ui/bits"
import { useToast } from "@/components/ui/toast"
import { LogStream } from "@/components/logs/log-stream"
import { formatClock, formatDuration, formatRelative } from "@/lib/deploy/format"
import { projectEndpoint } from "@/lib/deploy/helpers"
import { useDeploy, useDeployment, useDeploymentProgress, useDeployState } from "@/lib/deploy/react"
import { isTerminalStatus } from "@/lib/deploy/status"
import { DeployError } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"
import { DeploymentStatusView } from "@/components/ui/status"

export function DeploymentDetail() {
  const params = useParams<{ deploymentId: string }>()
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const router = useRouter()
  // The provider decides the deployment's state; the page's clock only formats durations.
  const view = useDeployment(params.deploymentId)
  const fraction = useDeploymentProgress(params.deploymentId)
  const live = view ? !view.finishedAt && !isTerminalStatus(view.status) : false
  const now = useNow(live ? 200 : 30000)
  const [busy, setBusy] = useState<"cancel" | "redeploy" | null>(null)
  const commitSha = view?.commitSha

  useEffect(() => {
    if (commitSha) document.title = `Deployment ${commitSha} · Arcellite Deploy`
  }, [commitSha])

  if (!state) return <PageSkeleton variant="detail" />
  if (!view) {
    return (
      <div className="page">
        <EmptyState title="Deployment not found" body="This release is not in the current workspace." />
      </div>
    )
  }
  const project = state.projects.find((item) => item.id === view.projectId)
  const endpoint = project ? projectEndpoint(project, state.servers[0]?.ip) : ""
  const sourceUrl = project?.source.type === "github" ? `https://github.com/${project.source.fullName}/commit/${view.commitSha}` : null
  const terminal = view.status === "ready" || view.status === "failed" || view.status === "canceled" || view.status === "stopped"

  const duration = view.finishedAt ? Date.parse(view.finishedAt) - Date.parse(view.createdAt) : now - Date.parse(view.createdAt)
  const pct = Math.round(fraction * 100)
  const failed = view.status === "failed" || view.status === "canceled"
  const activeStep = view.steps.find((step) => step.status === "active")

  function cancel() {
    setBusy("cancel")
    void deploy.cancelDeployment(params.deploymentId).then(
      () => {
        toast({ title: "Deployment canceled" })
        setBusy(null)
      },
      (error: unknown) => {
        setBusy(null)
        if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
      },
    )
  }
  function redeploy() {
    if (!project) return
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
  }

  return (
    <div className="page page-wide page-stack dd">
      <header className="page-introduction">
        <div className="page-introduction-main">
          <span className="page-introduction-icon"><Rocket aria-hidden /></span>
          <div className="min-w-0">
            <p className="page-kicker">{project ? <Link href={`/projects/${project.id}`} className="hover:text-[var(--brand-primary)]">{project.name}</Link> : "Deployment"} · <span className="capitalize">{view.environment}</span></p>
            <h1 className="page-title mt-1 font-heading">{view.commitMessage || view.sourceLabel}<span className="text-brand">.</span></h1>
            <div className="project-hero-meta">
              <DeploymentStatusView value={view.status} />
              <code className="table-code">{view.commitSha}</code>
              <span className="text-[12px] text-faint">{formatRelative(view.createdAt, now)} · by {view.triggeredBy}</span>
            </div>
          </div>
        </div>
        <div className="page-introduction-actions">
          {!terminal ? (
            <Button variant="danger" loading={busy === "cancel"} onClick={cancel}><X aria-hidden />Cancel</Button>
          ) : project ? (
            <Button variant="primary" loading={busy === "redeploy"} onClick={redeploy}><RotateCcw aria-hidden />Redeploy</Button>
          ) : null}
        </div>
      </header>

      {/* The URL slot keeps its size from the first frame: a placeholder while building, the live URL when ready. */}
      <section className="dd-url" data-state={view.status === "ready" ? "ready" : failed ? "failed" : "building"}>
        <span className="dd-url-icon" aria-hidden>{view.status === "ready" ? <Globe2 /> : failed ? <AlertTriangle /> : <Loader2 className="dd-spin" />}</span>
        <div className="min-w-0 flex-1">
          <p className="dd-url-label">{view.status === "ready" ? "Live — your deployment is serving" : failed ? view.error?.title ?? "Deployment stopped" : activeStep ? `${activeStep.label}…` : "Starting…"}</p>
          {view.status === "ready" && endpoint ? (
            <a className="dd-url-link" href={endpoint} target="_blank" rel="noreferrer">{endpoint}</a>
          ) : failed ? (
            <p className="dd-url-detail">{view.error ? `${view.error.detail} ${view.error.action}` : "This release did not finish. The previous release keeps serving."}</p>
          ) : (
            <p className="dd-url-placeholder"><span className="dd-url-skeleton" />Your URL appears here when the deploy finishes</p>
          )}
        </div>
        {view.status === "ready" && endpoint ? (
          <div className="dd-url-actions">
            <Button variant="secondary" size="sm" onClick={() => void copyText(endpoint).then((ok) => toast(ok ? { title: "URL copied" } : { title: "Could not copy", tone: "danger" }))}><Copy aria-hidden />Copy</Button>
            <a className="btn btn-primary btn-sm" href={endpoint} target="_blank" rel="noreferrer">Visit<ExternalLink aria-hidden /></a>
          </div>
        ) : (
          <span className="dd-url-pct">{failed ? "—" : `${pct}%`}</span>
        )}
      </section>

      <div className="dd-grid">
        <section className="panel dd-pipeline">
          <div className="dd-pipeline-head">
            <span className="dd-ring" style={{ "--pct": `${failed ? 100 : pct}%` } as React.CSSProperties} data-state={failed ? "failed" : terminal ? "done" : "running"}>
              <strong>{failed ? "!" : terminal ? <Check aria-hidden /> : `${pct}`}</strong>
            </span>
            <div className="min-w-0">
              <p className="dd-pipeline-title">{terminal ? (failed ? "Pipeline stopped" : "Pipeline complete") : "Building on your server"}</p>
              <p className="dd-pipeline-sub">{view.steps.filter((step) => step.status === "completed").length} of {view.steps.length} steps · {formatDuration(duration)}</p>
            </div>
          </div>
          <ol className="dd-steps">
            {view.steps.map((step) => {
              const took = step.startedAt && step.finishedAt ? Date.parse(step.finishedAt) - Date.parse(step.startedAt) : null
              return (
                <li key={step.phase} data-status={step.status}>
                  <span className="dd-step-dot" aria-hidden>{step.status === "completed" ? <Check /> : step.status === "failed" || step.status === "canceled" ? <X /> : step.status === "active" ? <Loader2 className="dd-spin" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <strong>{step.label}</strong>
                    <small>{step.status === "active" ? "Running now" : step.status === "pending" ? "Waiting" : step.status === "completed" ? `Done${step.finishedAt ? ` at ${formatClock(step.finishedAt)}` : ""}` : step.status === "failed" ? "Failed" : "Canceled"}</small>
                  </span>
                  <span className="dd-step-time">{took !== null ? formatDuration(took) : ""}</span>
                </li>
              )
            })}
          </ol>
          <dl className="dd-facts">
            <div><dt>Branch</dt><dd>{view.branch ?? "upload"}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(duration)}</dd></div>
            <div>
              <dt>Deployment ID</dt>
              <dd className="dd-fact-action"><span className="truncate">{view.id}</span><button type="button" className="icon-btn" aria-label="Copy deployment ID" onClick={() => void copyText(view.id).then((ok) => toast(ok ? { title: "Deployment ID copied" } : { title: "Could not copy", tone: "danger" }))}><Copy aria-hidden /></button></dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd className="dd-fact-action"><span className="truncate">{view.commitSha}</span>{sourceUrl ? <a className="icon-btn" href={sourceUrl} target="_blank" rel="noreferrer" aria-label="Open commit"><ExternalLink aria-hidden /></a> : null}</dd>
            </div>
          </dl>
        </section>
        <section className="dd-logs">
          <p className="dd-logs-title">Build and runtime logs</p>
          <LogStream target="deployment" id={view.id} />
        </section>
      </div>
    </div>
  )
}
