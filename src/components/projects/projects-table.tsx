"use client"

import { Code2, MoreHorizontal, Zap } from "lucide-react"
import { DataTable, selectColumn, type DataColumn } from "@/components/ui/data-table"
import Link from "next/link"
import { useMemo } from "react"
import { IconButton } from "@/components/ui/button"
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/overlays"
import { DeploymentStatusView } from "@/components/ui/status"
import { IconTile, Tag } from "@/components/ui/kit"
import { FRAMEWORKS } from "@/lib/deploy/detect"
import { formatRelative } from "@/lib/deploy/format"
import { projectEndpoint, sourceText } from "@/lib/deploy/helpers"
import type { DeploymentStatus, EnvironmentName, Framework, Project } from "@/lib/deploy/types"

export type ProjectTableRow = {
  id: string
  name: string
  sourceLabel: string
  environment: EnvironmentName
  framework: Framework
  frameworkLabel: string
  status: DeploymentStatus
  hostname: string
  endpoint: string
  updatedAt: string
  updatedLabel: string
  project: Project
}

type ProjectsTableProps = {
  rows: ProjectTableRow[]
  now: number
  onOpen: (projectId: string) => void
  onRedeploy: (projectId: string) => void
  onLogs: (projectId: string) => void
  onSettings: (projectId: string) => void
  onDeleteRequest: (project: Project) => void
  onCopyEndpoint: (endpoint: string) => void
}

function buildColumns(actions: Omit<ProjectsTableProps, "rows" | "now">): DataColumn<ProjectTableRow>[] {
  return [
    selectColumn<ProjectTableRow>((row) => row.name),
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <Link
          href={`/projects/${row.original.id}`}
          className="table-identity"
          onClick={(e) => e.stopPropagation()}
        >
          <IconTile icon={row.original.framework === "fastapi" ? Zap : Code2} tone={row.original.status === "failed" ? "danger" : row.original.status === "ready" ? "brand" : "info"} />
          <span className="min-w-0">
            <strong>{row.original.name}</strong>
            <small>{row.original.sourceLabel}</small>
          </span>
        </Link>
      ),
      header: "Project",
      size: 260,
    },
    {
      accessorKey: "environment",
      cell: ({ row }) => (
        <Tag tone={row.original.environment === "production" ? "brand" : row.original.environment === "preview" ? "info" : "neutral"}><span className="capitalize">{row.original.environment}</span></Tag>
      ),
      header: "Environment",
      size: 110,
    },
    {
      accessorKey: "frameworkLabel",
      cell: ({ row }) => (
        <span className="text-[12px] text-muted">{row.original.frameworkLabel}</span>
      ),
      header: "Framework",
      size: 120,
    },
    {
      accessorKey: "status",
      cell: ({ row }) => (
        <span className="table-status" data-status={row.original.status}>
          <DeploymentStatusView value={row.original.status} />
        </span>
      ),
      header: "Status",
      size: 130,
    },
    {
      accessorKey: "hostname",
      cell: ({ row }) => (
        <code className="table-code">{row.original.hostname}</code>
      ),
      header: "Endpoint",
      size: 160,
    },
    {
      accessorKey: "updatedAt",
      cell: ({ row }) => (
        <span className="text-[12px] tabular-nums text-faint">{row.original.updatedLabel}</span>
      ),
      header: "Updated",
      size: 100,
    },
    {
      id: "actions",
      enableSorting: false,
      size: 48,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const project = row.original.project
        return (
          <div className="relative z-10" onClick={(e) => e.stopPropagation()}>
            <Menu
              trigger={
                <IconButton label={`Actions for ${project.name}`}>
                  <MoreHorizontal />
                </IconButton>
              }
            >
              <MenuItem onSelect={() => actions.onOpen(project.id)}>Open</MenuItem>
              <MenuItem onSelect={() => actions.onRedeploy(project.id)}>Redeploy</MenuItem>
              <MenuItem onSelect={() => actions.onLogs(project.id)}>View logs</MenuItem>
              <MenuItem onSelect={() => actions.onCopyEndpoint(row.original.endpoint)}>Copy endpoint</MenuItem>
              <MenuItem onSelect={() => actions.onSettings(project.id)}>Settings</MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={() => actions.onDeleteRequest(project)}>
                Delete
              </MenuItem>
            </Menu>
          </div>
        )
      },
    },
  ]
}

export function mapProjectsToTableRows(
  projects: Project[],
  opts: {
    now: number
    serverIp?: string
    badgeFor: (project: Project) => DeploymentStatus
  },
): ProjectTableRow[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    sourceLabel: sourceText(project),
    environment: project.environment,
    framework: project.framework,
    frameworkLabel: FRAMEWORKS[project.framework].label,
    status: opts.badgeFor(project),
    hostname: project.hostname,
    endpoint: projectEndpoint(project, opts.serverIp),
    updatedAt: project.updatedAt,
    updatedLabel: formatRelative(project.updatedAt, opts.now),
    project,
  }))
}

export function ProjectsTable(props: ProjectsTableProps) {
  const { rows, onOpen } = props
  const columns = useMemo(
    () =>
      buildColumns({
        onOpen: props.onOpen,
        onRedeploy: props.onRedeploy,
        onLogs: props.onLogs,
        onSettings: props.onSettings,
        onDeleteRequest: props.onDeleteRequest,
        onCopyEndpoint: props.onCopyEndpoint,
      }),
    [props.onOpen, props.onRedeploy, props.onLogs, props.onSettings, props.onDeleteRequest, props.onCopyEndpoint],
  )
  return (
    <DataTable
      label="Projects"
      noun="projects"
      className="projects-table"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      onRowClick={(row) => onOpen(row.id)}
      initialSort={{ id: "updatedAt", desc: true }}
      pageSize={7}
      minRows={7}
    />
  )
}
