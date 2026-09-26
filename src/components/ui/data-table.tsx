"use client"

import {
  type ColumnDef,
  type RowData,
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
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/cn"

export const dataTableFeatures = tableFeatures({
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

export type DataColumn<T extends RowData> = ColumnDef<typeof dataTableFeatures, T>

/** Checkbox column with select-all in the header. */
export function selectColumn<T extends RowData>(label: (row: T) => string): DataColumn<T> {
  return {
    id: "select",
    size: 44,
    enableSorting: false,
    header: ({ table }) => {
      const all = table.getIsAllPageRowsSelected()
      const some = table.getIsSomePageRowsSelected()
      return (
        <input
          type="checkbox"
          className="table-check"
          aria-label="Select all rows"
          checked={all}
          ref={(node) => { if (node) node.indeterminate = some && !all }}
          onChange={(event) => table.toggleAllPageRowsSelected(event.target.checked)}
        />
      )
    },
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="table-check"
        aria-label={`Select ${label(row.original)}`}
        checked={row.getIsSelected()}
        onChange={(event) => row.toggleSelected(event.target.checked)}
      />
    ),
  }
}

/**
 * Sortable, selectable, paginated table in the workspace style. Rows open on
 * click; clicks in the select and actions columns stay in their cells.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  getRowId,
  onRowClick,
  initialSort,
  pageSize = 10,
  className,
  label,
  noun = "results",
}: {
  columns: DataColumn<T>[]
  data: T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  initialSort?: { id: string; desc: boolean }
  pageSize?: number
  className?: string
  label: string
  noun?: string
}) {
  const table = useTable(
    {
      columns,
      data,
      enableSortingRemoval: false,
      features: dataTableFeatures,
      getRowId,
      initialState: {
        pagination: { pageIndex: 0, pageSize },
        sorting: initialSort ? [initialSort] : [],
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
        <table className={cn("data-table", className)} aria-label={label}>
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
                <tr key={row.id} data-selected={row.getIsSelected() || undefined} onClick={onRowClick ? () => onRowClick(row.original) : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`col-${cell.column.id}`}
                      onClick={cell.column.id === "select" || cell.column.id === "actions" ? (event) => event.stopPropagation() : undefined}
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
          Showing <strong>{first}–{last}</strong> of <strong>{total}</strong> {noun}
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
