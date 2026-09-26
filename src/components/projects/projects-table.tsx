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
import { ChevronDownIcon, ChevronUpIcon, Code2, MoreHorizontal, Zap } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { IconButton } from "@/components/ui/button"
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/overlays"
import { DeploymentStatusView } from "@/components/ui/status"
import { Badge } from "@/components/ui/p-table-4-utils/badge"
import { Button } from "@/components/ui/p-table-4-utils/button"
import { Checkbox } from "@/components/ui/p-table-4-utils/checkbox"
import { Frame, FrameFooter } from "@/components/ui/p-table-4-utils/frame"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/p-table-4-utils/pagination"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/p-table-4-utils/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/p-table-4-utils/table"
import { FRAMEWORKS } from "@/lib/deploy/detect"
import { formatRelative } from "@/lib/deploy/format"
import { projectEndpoint, sourceText } from "@/lib/deploy/helpers"
import { cn } from "@/lib/utils"
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

const statusDot: Record<DeploymentStatus, string> = {
  ready: "bg-emerald-500",
  building: "bg-blue-500",
  deploying: "bg-blue-500",
  preparing: "bg-blue-500",
  queued: "bg-zinc-400",
  failed: "bg-red-500",
  canceled: "bg-zinc-400",
  stopped: "bg-amber-500",
}

function buildColumns(actions: Omit<ProjectsTableProps, "rows" | "now">): ColumnDef<typeof features, ProjectTableRow>[] {
  return [
    {
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      header: ({ table }) => {
        const isAllSelected = table.getIsAllPageRowsSelected()
        const isSomeSelected = table.getIsSomePageRowsSelected()
        return (
          <Checkbox
            aria-label="Select all rows"
            checked={isAllSelected}
            indeterminate={isSomeSelected && !isAllSelected}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          />
        )
      },
      id: "select",
      size: 28,
    },
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <Link
          href={`/projects/${row.original.id}`}
          className="relative z-10 flex min-w-0 items-center gap-2 font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken text-muted-foreground">
            {row.original.framework === "fastapi" ? <Zap className="size-3.5" aria-hidden /> : <Code2 className="size-3.5" aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{row.original.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{row.original.sourceLabel}</span>
          </span>
        </Link>
      ),
      header: "Project",
      size: 220,
    },
    {
      accessorKey: "environment",
      cell: ({ row }) => (
        <span className="capitalize text-muted-foreground">{row.original.environment}</span>
      ),
      header: "Environment",
      size: 110,
    },
    {
      accessorKey: "frameworkLabel",
      cell: ({ row }) => (
        <Badge variant="outline" className="font-normal">
          {row.original.frameworkLabel}
        </Badge>
      ),
      header: "Framework",
      size: 120,
    },
    {
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant="outline">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", statusDot[row.original.status] ?? "bg-zinc-400")}
          />
          <DeploymentStatusView value={row.original.status} />
        </Badge>
      ),
      header: "Status",
      size: 130,
    },
    {
      accessorKey: "hostname",
      cell: ({ row }) => (
        <span className="truncate font-mono text-xs text-muted-foreground">{row.original.hostname}</span>
      ),
      header: "Endpoint",
      size: 160,
    },
    {
      accessorKey: "updatedAt",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{row.original.updatedLabel}</span>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <Frame className="w-full">
      <Table variant="card" className="table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className="hover:bg-transparent" key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const columnSize = header.column.getSize()
                return (
                  <TableHead
                    key={header.id}
                    style={columnSize ? { width: `${columnSize}px` } : undefined}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className="flex h-full cursor-pointer select-none items-center justify-between gap-2"
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            header.column.getToggleSortingHandler()?.(e)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: (
                            <ChevronUpIcon aria-hidden className="size-4 shrink-0 opacity-80" />
                          ),
                          desc: (
                            <ChevronDownIcon aria-hidden className="size-4 shrink-0 opacity-80" />
                          ),
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                data-state={row.getIsSelected() ? "selected" : undefined}
                key={row.id}
                className="cursor-pointer"
                onClick={() => onOpen(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    onClick={
                      cell.column.id === "select" || cell.column.id === "actions"
                        ? (e) => e.stopPropagation()
                        : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={columns.length}>
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <FrameFooter className="p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <p className="text-muted-foreground text-sm">Viewing</p>
            <Select
              items={Array.from({ length: Math.max(table.getPageCount(), 1) }, (_, i) => {
                const start = i * table.state.pagination.pageSize + 1
                const end = Math.min(
                  (i + 1) * table.state.pagination.pageSize,
                  table.getRowCount(),
                )
                const pageNum = i + 1
                return { label: `${start}-${end}`, value: pageNum }
              })}
              onValueChange={(value) => {
                table.setPageIndex((value as number) - 1)
              }}
              value={table.state.pagination.pageIndex + 1}
            >
              <SelectTrigger
                aria-label="Select result range"
                className="w-fit min-w-none"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {Array.from({ length: Math.max(table.getPageCount(), 1) }, (_, i) => {
                  const start = i * table.state.pagination.pageSize + 1
                  const end = Math.min(
                    (i + 1) * table.state.pagination.pageSize,
                    table.getRowCount(),
                  )
                  const pageNum = i + 1
                  return (
                    <SelectItem key={pageNum} value={pageNum}>
                      {`${start}-${end}`}
                    </SelectItem>
                  )
                })}
              </SelectPopup>
            </Select>
            <p className="text-muted-foreground text-sm">
              of{" "}
              <strong className="font-medium text-foreground">{table.getRowCount()}</strong>{" "}
              results
            </p>
          </div>

          <Pagination className="justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  className="sm:*:[svg]:hidden"
                  render={
                    <Button
                      disabled={!table.getCanPreviousPage()}
                      onClick={() => table.previousPage()}
                      size="sm"
                      variant="outline"
                    />
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  className="sm:*:[svg]:hidden"
                  render={
                    <Button
                      disabled={!table.getCanNextPage()}
                      onClick={() => table.nextPage()}
                      size="sm"
                      variant="outline"
                    />
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </FrameFooter>
    </Frame>
  )
}

