"use client"

import Link from "next/link"
import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Check, CircleAlert, CircleCheck, FolderInput, GitBranch, Hammer, HeartPulse, Layers, Loader, Loader2, Package, Play, Rocket, Workflow, X } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, SectionHeading, StatCard, StatGrid } from "@/components/ui/kit"
import { DeploymentStatusView } from "@/components/ui/status"
import { isTerminalStatus } from "@/lib/deploy/status"
import { formatDuration, formatRelative } from "@/lib/deploy/format"
import { useDeployments, useDeployState } from "@/lib/deploy/react"
import type { Deployment } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

const STAGE_ICONS = [FolderInput, Package, Hammer, Layers, Play, HeartPulse, Rocket]

const FILTERS = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "ready", label: "Succeeded" },
  { id: "failed", label: "Failed" },
] as const

function stepMs(step: Deployment["steps"][number], now: number) {
  if (!step.startedAt) return 0
  return (step.finishedAt ? Date.parse(step.finishedAt) : now) - Date.parse(step.startedAt)
}

export function PipelinesView() {
  const state = useDeployState()
  const now = useNow(1000)
  const reduced = useReducedMotion()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all")
  const jobs = useDeployments()
  if (!state) return <PageSkeleton variant="table" />
  const active = jobs.filter((job) => !isTerminalStatus(job.status))
  const done = jobs.filter((job) => job.status === "ready").length
  const failed = jobs.filter((job) => job.status === "failed").length
  const finished = jobs.filter((job) => job.finishedAt && job.status === "ready")
  const avg = finished.length ? finished.reduce((sum, job) => sum + (Date.parse(job.finishedAt!) - Date.parse(job.createdAt)), 0) / finished.length : 0

  // Stage analytics keyed by phase, so pipelines with different steps still line up.
  const template = jobs[0]?.steps ?? []
  const stages = template.map((step) => {
    const runs = jobs.flatMap((job) => job.steps.filter((run) => run.phase === step.phase))
    const timed = runs.filter((run) => run.status === "completed").map((run) => stepMs(run, now))
    const failures = runs.filter((run) => run.status === "failed").length
    return {
      label: step.label,
      avg: timed.length ? timed.reduce((sum, value) => sum + value, 0) / timed.length : 0,
      passed: runs.filter((run) => run.status === "completed").length,
      failures,
      running: runs.filter((run) => run.status === "active").length,
    }
  })
  const slowest = Math.max(1, ...stages.map((stage) => stage.avg))

  const match = (job: Deployment) => filter === "all" || (filter === "running" ? !isTerminalStatus(job.status) : filter === "failed" ? job.status === "failed" || job.status === "canceled" : job.status === filter)
  const shown = jobs.filter(match)
  const counts = { all: jobs.length, running: active.length, ready: done, failed: jobs.filter((job) => job.status === "failed" || job.status === "canceled").length }

  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={Workflow} kicker="Observe" title="Pipelines" description="Every deployment runs through the build pipeline: prepare, install, build, image, start, and health check." />
      <StatGrid>
        <StatCard icon={Loader} tone="brand" label="Active" value={active.length} detail={active.length ? "Running now" : "Queue is empty"} />
        <StatCard icon={CircleCheck} tone="success" label="Succeeded" value={done} detail="Completed every step" />
        <StatCard icon={CircleAlert} tone={failed ? "danger" : "neutral"} label="Failed" value={failed} detail={failed ? "Check the build log" : "No failures"} />
        <StatCard icon={Hammer} tone="info" label="Average build" value={avg ? formatDuration(avg) : "—"} detail="Successful runs" />
      </StatGrid>

      {jobs.length === 0 ? (
        <EmptyPanel icon={Workflow} title="No pipeline runs" body="Each deployment starts a pipeline run." />
      ) : (
        <>
          <section>
            <SectionHeading title="The pipeline" aside={<span className="text-xs text-faint">Average time per stage across {jobs.length} runs</span>} />
            <ol className="pl-stages">
              {stages.map((stage, index) => (
                <motion.li
                  key={stage.label}
                  initial={reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.4, delay: index * 0.04 }}
                  data-state={stage.running ? "running" : stage.failures ? "warn" : "ok"}
                >
                  <span className="pl-stage-top">
                    <span className="pl-stage-icon" aria-hidden>{(() => { const Icon = STAGE_ICONS[index] ?? Workflow; return <Icon /> })()}</span>
                    <span className="pl-stage-time">{stage.avg ? formatDuration(stage.avg) : "—"}</span>
                  </span>
                  <strong>{stage.label}</strong>
                  <span className="pl-stage-bar" aria-hidden><motion.i initial={reduced ? false : { width: 0 }} animate={{ width: `${(stage.avg / slowest) * 100}%` }} transition={{ type: "spring", bounce: 0, duration: 0.6, delay: 0.1 + index * 0.04 }} /></span>
                  <small>{stage.failures ? `${stage.failures} failed` : stage.running ? `${stage.running} running` : `${stage.passed} passed`}</small>
                </motion.li>
              ))}
            </ol>
          </section>

          <section>
            <SectionHeading
              title="Runs"
              count={shown.length}
              aside={
                <div className="segmented" role="group" aria-label="Filter runs">
                  {FILTERS.map((item) => (
                    <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                      {item.label}<span className="al-seg-count">{counts[item.id]}</span>
                    </button>
                  ))}
                </div>
              }
            />
            <ul className="pl-runs">
              {shown.map((job, index) => {
                const project = state.projects.find((item) => item.id === job.projectId)
                const total = job.steps.reduce((sum, step) => sum + stepMs(step, now), 0)
                const completed = job.steps.filter((step) => step.status === "completed").length
                const elapsed = (job.finishedAt ? Date.parse(job.finishedAt) : now) - Date.parse(job.createdAt)
                return (
                  <motion.li
                    key={job.id}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.36, delay: Math.min(index, 8) * 0.03 }}
                  >
                    <Link href={`/deployments/${job.id}`} className="pl-run" data-status={job.status}>
                      <span className="pl-run-icon" aria-hidden>
                        {job.status === "ready" ? <Check /> : job.status === "failed" || job.status === "canceled" ? <X /> : <Loader2 className="dd-spin" />}
                      </span>
                      <span className="pl-run-main">
                        <span className="pl-run-title"><strong>{project?.name ?? "Project"}</strong><span className="truncate">{job.commitMessage || job.sourceLabel}</span></span>
                        <span className="pl-run-meta"><GitBranch aria-hidden />{job.branch ?? "upload"}<code>{job.commitSha}</code><span>{formatRelative(job.createdAt, now)}</span></span>
                      </span>
                      <span className="pl-track" aria-label={`${completed} of ${job.steps.length} steps`}>
                        {job.steps.map((step) => (
                          <i
                            key={step.phase}
                            data-status={step.status}
                            title={`${step.label}: ${step.status}${stepMs(step, now) ? ` · ${formatDuration(stepMs(step, now))}` : ""}`}
                            style={{ flexGrow: total && stepMs(step, now) ? Math.max(0.35, stepMs(step, now) / (total / job.steps.length)) : 1 }}
                          />
                        ))}
                      </span>
                      <span className="pl-run-time">{formatDuration(elapsed)}</span>
                      <span className="pl-run-status"><DeploymentStatusView value={job.status} /></span>
                      <ArrowUpRight aria-hidden className="pl-run-arrow" />
                    </Link>
                  </motion.li>
                )
              })}
              {shown.length === 0 ? <li className="pd-empty">No runs match this filter.</li> : null}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
