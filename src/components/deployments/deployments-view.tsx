"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
import { SelectInput, TextInput } from "@/components/ui/fields"
import { DeploymentStatusView } from "@/components/ui/status"
import { filterDeployments } from "@/lib/deploy/filters"
import { formatDuration, formatRelative } from "@/lib/deploy/format"
import { materializeDeployment } from "@/lib/deploy/engine"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import type { DeploymentStatus, EnvironmentName } from "@/lib/deploy/types"

export function DeploymentsView() {
  const state = useDeployState()
  const now = useNow(1000)
  const [search, setSearch] = useState("")
  const [projectId, setProjectId] = useState<string | "all">("all")
  const [environment, setEnvironment] = useState<EnvironmentName | "all">("all")
  const [status, setStatus] = useState<DeploymentStatus | "all">("all")
  const rows = useMemo(() => {
    if (!state) return []
    const live = state.deployments.map((deployment) => materializeDeployment(deployment, now))
    return filterDeployments(live, state.projects, { search, projectId, environment, status })
  }, [state, now, search, projectId, environment, status])
  if (!state) return <PageSkeleton />
  return (
    <div className="page page-wide">
      <PageHeader title="Deployments" description="Releases across every project on this server." />
      <div className="filter-toolbar">
        <TextInput aria-label="Search deployments" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search commit or project" />
        <SelectInput aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="all">All projects</option>
          {state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </SelectInput>
        <SelectInput aria-label="Environment" value={environment} onChange={(event) => setEnvironment(event.target.value as EnvironmentName | "all")}>
          <option value="all">All environments</option>
          <option value="production">Production</option>
          <option value="preview">Preview</option>
          <option value="development">Development</option>
        </SelectInput>
        <SelectInput aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as DeploymentStatus | "all")}>
          <option value="all">All statuses</option>
          {["queued", "preparing", "building", "deploying", "ready", "failed", "canceled", "stopped"].map((item) => <option key={item} value={item}>{item}</option>)}
        </SelectInput>
      </div>
      <div className="mt-6">
        {state.deployments.length === 0 ? (
          <EmptyState title="No deployments" body="Create a project and deploy it to see releases here." />
        ) : rows.length === 0 ? (
          <EmptyState title="No deployments match" body="Adjust the filters to see more releases." />
        ) : (
          <ul className="panel resource-list deployment-list">
            <li className="list-columns deployment-table-row" aria-hidden="true"><span className="deployment-status">Status</span><span className="deployment-name">Project / commit</span><span className="deployment-environment">Environment</span><span className="deployment-source">Source</span><span className="deployment-time">Duration / created</span></li>
            {rows.map((deployment) => {
              const project = state.projects.find((item) => item.id === deployment.projectId)
              const duration = deployment.finishedAt ? formatDuration(Date.parse(deployment.finishedAt) - Date.parse(deployment.createdAt)) : "In progress"
              return (
                <li key={deployment.id}>
                  <Link href={`/deployments/${deployment.id}`} className="data-row deployment-table-row">
                    <span className="deployment-status"><DeploymentStatusView value={deployment.status} /></span>
                    <span className="deployment-name">
                      <span className="block font-medium">{project?.name ?? "Removed project"}</span>
                      <span className="block truncate text-sm text-muted">{deployment.commitMessage}</span>
                    </span>
                    <span className="deployment-environment text-sm capitalize text-muted">{deployment.environment}</span>
                    <span className="deployment-source font-mono text-xs text-muted">{deployment.branch ?? "upload"} · {deployment.commitSha}</span>
                    <span className="deployment-time text-sm text-faint">{duration}<br />{formatRelative(deployment.createdAt, now)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
