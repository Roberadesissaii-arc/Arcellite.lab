"use client"

import {
  type ColumnDef,
  columnSizingFeature,
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Code2, MoreHorizontal, Zap } from "lucide-react"
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

const features = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
  },
})

function buildColumns(actions: Omit<ProjectsTableProps, "rows" | "now">): ColumnDef<typeof features, ProjectTableRow>[] {
  return [
    {
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="table-check"
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          onChange={(event) => row.toggleSelected(event.target.checked)}
        />
      ),
      enableSorting: false,
      header: ({ table }) => {
        const isAllSelected = table.getIsAllPageRowsSelected()
        const isSomeSelected = table.getIsSomePageRowsSelected()
        return (
          <input
            type="checkbox"
            className="table-check"
            aria-label="Select all rows"
            checked={isAllSelected}
            ref={(node) => { if (node) node.indeterminate = isSomeSelected && !isAllSelected }}
            onChange={(event) => table.toggleAllPageRowsSelected(event.target.checked)}
          />
        )
      },
      id: "select",
      size: 44,
    },
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
  const { rows, onOpen } = props // now reserved for live relabel
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

  const pageSize = 10

  const table = useTable(
    {
      columns,
      data: rows,
      enableSortingRemoval: false,
      features,
      getRowId: (row) => row.id,
      initialState: {
        pagination: {
          pageIndex: 0,
          pageSize,
        },
        sorting: [
          {
            desc: true,
            id: "updatedAt",
          },
        ],
      },
    },
    (state) => ({
      pagination: state.pagination,
      rowSelection: state.rowSelection,
      sorting: state.sorting,
    }),
  )

  const selected = Object.keys(table.state.rowSelection ?? {}).length
  const { pageIndex, pageSize: size } = table.state.pagination
  const total = table.getRowCount()
  const first = total ? pageIndex * size + 1 : 0
  const last = Math.min((pageIndex + 1) * size, total)

  return (
    <div className="panel data-table-wrap">
      <div className="data-table-scroll">
        <table className="data-table">
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => <col key={column.id} className={`col-${column.id}`} style={{ width: column.getSize() }} />)}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th key={header.id} className={`col-${header.column.id}`} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button type="button" className="th-sort" data-sorted={Boolean(sorted)} onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? <ArrowUp aria-hidden /> : sorted === "desc" ? <ArrowDown aria-hidden /> : <ArrowUpDown aria-hidden />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} data-selected={row.getIsSelected() || undefined} onClick={() => onOpen(row.original.id)}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`col-${cell.column.id}`}
                      onClick={cell.column.id === "select" || cell.column.id === "actions" ? (e) => e.stopPropagation() : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-10 text-center text-muted" colSpan={columns.length}>No results.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="data-table-footer">
        <p>
          {selected ? <><strong>{selected}</strong> selected · </> : null}
          Showing <strong>{first}–{last}</strong> of <strong>{total}</strong>
        </p>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-faint">Page {pageIndex + 1} of {Math.max(table.getPageCount(), 1)}</span>
          <button type="button" className="icon-btn pressable" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft aria-hidden /></button>
          <button type="button" className="icon-btn pressable" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight aria-hidden /></button>
        </div>
      </div>
    </div>
  )
}
