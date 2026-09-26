"use client"

import { BriefcaseBusiness, CircleAlert, CircleCheck, Hammer, Loader } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, ItemList, ItemRow, SectionHeading, StatCard, StatGrid, deploymentTone } from "@/components/ui/kit"
import { DeploymentStatusView } from "@/components/ui/status"
import { isTerminalStatus, materializeDeployment } from "@/lib/deploy/engine"
import { formatDuration, formatRelative } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function JobsView() {
  const state = useDeployState()
  const now = useNow(1000)
  if (!state) return <PageSkeleton />
  const jobs = [...state.deployments]
    .map((deployment) => materializeDeployment(deployment, now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const active = jobs.filter((job) => !isTerminalStatus(job.status))
  const done = jobs.filter((job) => job.status === "ready").length
  const failed = jobs.filter((job) => job.status === "failed").length
  const finished = jobs.filter((job) => job.finishedAt && job.status === "ready")
  const avg = finished.length ? finished.reduce((sum, job) => sum + (Date.parse(job.finishedAt!) - Date.parse(job.createdAt)), 0) / finished.length : 0
  return (
    <div className="page page-stack">
      <PageHeader icon={BriefcaseBusiness} kicker="Observe" title="Jobs" description="Build and deploy work on this server — each deployment runs as one job through the pipeline." />
      <StatGrid>
        <StatCard icon={Loader} tone="brand" label="Active" value={active.length} detail={active.length ? "Running now" : "Queue is empty"} />
        <StatCard icon={CircleCheck} tone="success" label="Succeeded" value={done} detail="Completed every step" />
        <StatCard icon={CircleAlert} tone={failed ? "danger" : "neutral"} label="Failed" value={failed} detail={failed ? "Check the build log" : "No failures"} />
        <StatCard icon={Hammer} tone="info" label="Average build" value={avg ? formatDuration(avg) : "—"} detail="Successful jobs" />
      </StatGrid>
      <section>
        <SectionHeading title="Job history" count={jobs.length} />
        {jobs.length === 0 ? (
          <EmptyPanel icon={BriefcaseBusiness} title="No jobs" body="A deployment starts a job." />
        ) : (
          <ItemList label="Jobs">
            {jobs.map((job) => {
              const project = state.projects.find((item) => item.id === job.projectId)
              const completed = job.steps.filter((step) => step.status === "completed").length
              const pct = job.steps.length ? (completed / job.steps.length) * 100 : 0
              return (
                <ItemRow
                  key={job.id}
                  href={`/deployments/${job.id}`}
                  icon={Hammer}
                  tone={deploymentTone(job.status)}
                  title={project?.name ?? "Project"}
                  subtitle={`${job.commitMessage || job.sourceLabel} · ${formatRelative(job.createdAt, now)}`}
                  meta={[
                    <span key="steps" className="flex items-center gap-2">
                      <span className="job-progress" aria-hidden><span style={{ width: `${pct}%` }} data-status={job.status} /></span>
                      <span className="text-faint">{completed}/{job.steps.length}</span>
                    </span>,
                  ]}
                  metaWidths={[150]}
                  trailing={<span className="w-[92px]"><DeploymentStatusView value={job.status} /></span>}
                />
              )
            })}
          </ItemList>
        )}
      </section>
    </div>
  )
}
