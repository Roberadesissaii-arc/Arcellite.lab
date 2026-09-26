"use client"

import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
import { DeploymentStatusView } from "@/components/ui/status"
import { materializeDeployment } from "@/lib/deploy/engine"
import { formatRelative } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function JobsView() {
  const state = useDeployState()
  const now = useNow(1000)
  if (!state) return <PageSkeleton />
  const jobs = [...state.deployments]
    .map((deployment) => materializeDeployment(deployment, now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return (
    <div className="page">
      <PageHeader title="Jobs" description="Build and deploy work on this server." />
      {jobs.length === 0 ? (
        <div className="panel mt-6">
          <EmptyState title="No jobs" body="A deployment starts a job." />
        </div>
      ) : (
        <ul className="panel mt-6 divide-y divide-zinc-200">
          {jobs.map((job) => {
            const project = state.projects.find((item) => item.id === job.projectId)
            return (
              <li key={job.id}>
                <Link href={`/deployments/${job.id}`} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium text-zinc-900">{project?.name ?? "Project"}</span>
                    <span className="text-[13px] text-zinc-500">{job.commitMessage} · {formatRelative(job.createdAt, now)}</span>
                  </span>
                  <DeploymentStatusView value={job.status} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
