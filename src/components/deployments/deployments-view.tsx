"use client"

import { useMemo, useState } from "react"
import { CircleAlert, CircleCheck, GitBranch, Loader, Rocket, SearchX } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { EmptyPanel, ItemList, ItemRow, SearchField, SectionHeading, StatCard, StatGrid, Tag, deploymentTone } from "@/components/ui/kit"
import { DeploymentStatusView } from "@/components/ui/status"
import { filterDeployments } from "@/lib/deploy/filters"
import { formatDuration, formatRelative } from "@/lib/deploy/format"
import { isTerminalStatus, materializeDeployment } from "@/lib/deploy/engine"
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
  const live = useMemo(() => state ? state.deployments.map((deployment) => materializeDeployment(deployment, now)) : [], [state, now])
  const rows = useMemo(() => state ? filterDeployments(live, state.projects, { search, projectId, environment, status }) : [], [state, live, search, projectId, environment, status])
  if (!state) return <PageSkeleton />
  const ready = live.filter((item) => item.status === "ready").length
  const running = live.filter((item) => !isTerminalStatus(item.status)).length
  const failed = live.filter((item) => item.status === "failed").length
  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={Rocket} kicker="Workspace" title="Deployments" description="Every release across your projects on this server — status, source, and how long it took." />
      <StatGrid>
        <StatCard icon={GitBranch} tone="brand" label="Total releases" value={live.length} detail={`${state.projects.length} projects`} />
        <StatCard icon={CircleCheck} tone="success" label="Ready" value={ready} detail="Serving or served traffic" />
        <StatCard icon={Loader} tone="info" label="In progress" value={running} detail={running ? "Building right now" : "Nothing building"} />
        <StatCard icon={CircleAlert} tone={failed ? "danger" : "neutral"} label="Failed" value={failed} detail={failed ? "Needs a look" : "No failed releases"} />
      </StatGrid>
      <section>
        <SectionHeading title="Releases" count={rows.length} />
        <div className="filter-toolbar">
          <SearchField label="Search deployments" value={search} onChange={setSearch} placeholder="Search commit or project" />
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
            {["queued", "preparing", "building", "deploying", "ready", "failed", "canceled", "stopped"].map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
          </SelectInput>
        </div>
        <div className="mt-3">
          {state.deployments.length === 0 ? (
            <EmptyPanel icon={Rocket} title="No deployments yet" body="Create a project and deploy it to see releases here." />
          ) : rows.length === 0 ? (
            <EmptyPanel icon={SearchX} title="No deployments match" body="Adjust the filters to see more releases." />
          ) : (
            <ItemList label="Deployments">
              {rows.map((deployment) => {
                const project = state.projects.find((item) => item.id === deployment.projectId)
                const duration = deployment.finishedAt ? formatDuration(Date.parse(deployment.finishedAt) - Date.parse(deployment.createdAt)) : "In progress"
                return (
                  <ItemRow
                    key={deployment.id}
                    href={`/deployments/${deployment.id}`}
                    icon={GitBranch}
                    tone={deploymentTone(deployment.status)}
                    title={project?.name ?? "Removed project"}
                    subtitle={deployment.commitMessage || deployment.sourceLabel}
                    meta={[
                      <Tag key="env"><span className="capitalize">{deployment.environment}</span></Tag>,
                      <span key="src" className="font-mono text-[11px]">{deployment.branch ?? "upload"} · {deployment.commitSha}</span>,
                      <span key="dur" className="text-faint">{duration}</span>,
                    ]}
                    metaWidths={[110, 150, 80]}
                    trailing={<><span className="w-[92px]"><DeploymentStatusView value={deployment.status} /></span><time className="w-[74px] text-right text-[11px] text-faint" dateTime={deployment.createdAt}>{formatRelative(deployment.createdAt, now)}</time></>}
                  />
                )
              })}
            </ItemList>
          )}
        </div>
      </section>
    </div>
  )
}
