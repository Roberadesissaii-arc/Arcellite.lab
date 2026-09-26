"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CircleAlert, CircleCheck, GitBranch, Loader, MoreHorizontal, Rocket, SearchX } from "lucide-react"
import { IconButton } from "@/components/ui/button"
import { DataTable, selectColumn, type DataColumn } from "@/components/ui/data-table"
import { Menu, MenuItem } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { PageHeader } from "@/components/page-header"
import { copyText, PageSkeleton } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { ServiceStatusBoard } from "@/components/status/service-status"
import { EmptyPanel, IconTile, SearchField, SectionHeading, StatCard, StatGrid, Tag, deploymentTone } from "@/components/ui/kit"
import { DeploymentStatusView } from "@/components/ui/status"
import { filterDeployments } from "@/lib/deploy/filters"
import { formatDuration, formatRelative } from "@/lib/deploy/format"
import { isTerminalStatus, materializeDeployment } from "@/lib/deploy/engine"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import { DeployError, type Deployment, type DeploymentStatus, type EnvironmentName } from "@/lib/deploy/types"

type DeploymentRow = Deployment & { projectName: string; durationMs: number }

export function DeploymentsView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const router = useRouter()
  const toast = useToast()
  const now = useNow(1000)
  const [search, setSearch] = useState("")
  const [projectId, setProjectId] = useState<string | "all">("all")
  const [environment, setEnvironment] = useState<EnvironmentName | "all">("all")
  const [status, setStatus] = useState<DeploymentStatus | "all">("all")
  const live = useMemo(() => state ? state.deployments.map((deployment) => materializeDeployment(deployment, now)) : [], [state, now])
  const rows = useMemo(() => state ? filterDeployments(live, state.projects, { search, projectId, environment, status }) : [], [state, live, search, projectId, environment, status])
  const tableRows: DeploymentRow[] = rows.map((deployment) => ({
    ...deployment,
    projectName: state?.projects.find((item) => item.id === deployment.projectId)?.name ?? "Removed project",
    durationMs: deployment.finishedAt ? Date.parse(deployment.finishedAt) - Date.parse(deployment.createdAt) : Number.POSITIVE_INFINITY,
  }))
  const columns: DataColumn<DeploymentRow>[] = [
    selectColumn<DeploymentRow>((row) => `${row.projectName} ${row.commitSha}`),
    {
      accessorKey: "projectName",
      header: "Deployment",
      size: 280,
      cell: ({ row }) => (
        <span className="table-identity">
          <IconTile icon={GitBranch} tone={deploymentTone(row.original.status)} />
          <span className="min-w-0"><strong>{row.original.projectName}</strong><small>{row.original.commitMessage || row.original.sourceLabel}</small></span>
        </span>
      ),
    },
    {
      accessorKey: "environment",
      header: "Environment",
      size: 120,
      cell: ({ row }) => <Tag tone={row.original.environment === "production" ? "brand" : row.original.environment === "preview" ? "info" : "neutral"}><span className="capitalize">{row.original.environment}</span></Tag>,
    },
    {
      accessorKey: "commitSha",
      header: "Source",
      size: 170,
      cell: ({ row }) => <code className="table-code">{row.original.branch ?? "upload"} · {row.original.commitSha}</code>,
    },
    { accessorKey: "status", header: "Status", size: 120, cell: ({ row }) => <DeploymentStatusView value={row.original.status} /> },
    {
      accessorKey: "durationMs",
      header: "Duration",
      size: 100,
      cell: ({ row }) => <span className="text-[12px] tabular-nums text-muted">{Number.isFinite(row.original.durationMs) ? formatDuration(row.original.durationMs) : "In progress"}</span>,
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      size: 110,
      cell: ({ row }) => <time className="text-[12px] tabular-nums text-faint" dateTime={row.original.createdAt}>{formatRelative(row.original.createdAt, now)}</time>,
    },
    {
      id: "actions",
      size: 52,
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Menu trigger={<IconButton label={`Actions for ${row.original.projectName} ${row.original.commitSha}`}><MoreHorizontal /></IconButton>}>
          <MenuItem onSelect={() => router.push(`/deployments/${row.original.id}`)}>Open</MenuItem>
          <MenuItem onSelect={() => router.push(`/projects/${row.original.projectId}/logs`)}>View logs</MenuItem>
          <MenuItem onSelect={() => void deploy.redeploy(row.original.projectId).then((next) => { toast({ title: "Redeploy started", description: row.original.projectName }); router.push(`/deployments/${next.id}`) }, (error: unknown) => { if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" }) })}>Redeploy project</MenuItem>
          <MenuItem onSelect={() => void copyText(row.original.commitSha).then((ok) => toast(ok ? { title: "Commit copied" } : { title: "Could not copy", tone: "danger" }))}>Copy commit</MenuItem>
        </Menu>
      ),
    },
  ]
  if (!state) return <PageSkeleton variant="table" />
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
      <ServiceStatusBoard state={state} now={now} />
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
            <DataTable
              key={`${search}|${projectId}|${environment}|${status}`}
              label="Deployments"
              noun="deployments"
              className="deployments-table"
              columns={columns}
              data={tableRows}
              getRowId={(row) => row.id}
              onRowClick={(row) => router.push(`/deployments/${row.id}`)}
              initialSort={{ id: "createdAt", desc: true }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
