"use client"

import Link from "next/link"
import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { formatDateTime } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"

export function ActivityView() {
  const state = useDeployState()
  const [result, setResult] = useState("all")
  if (!state) return <PageSkeleton />
  const rows = state.activity.filter((event) => result === "all" || event.result === result)
  return (
    <div className="page">
      <PageHeader title="Activity" description="What changed in this workspace, and who did it." />
      <div className="mt-6 max-w-[200px]">
        <SelectInput aria-label="Result" value={result} onChange={(event) => setResult(event.target.value)}>
          <option value="all">All results</option>
          <option value="success">Success</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </SelectInput>
      </div>
      {rows.length === 0 ? <EmptyState title="No activity" body="Actions you take in this workspace will show up here." /> : (
        <ol className="panel resource-list mt-6">
          {rows.map((event) => (
            <li key={event.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[160px_1fr]">
              <time className="text-sm text-faint" dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
              <div>
                <p>
                  <span className="font-medium">{event.action}</span>
                  <span className="text-muted"> · {event.objectType} · </span>
                  {event.href ? <Link href={event.href} className="underline underline-offset-4">{event.objectName}</Link> : event.objectName}
                </p>
                <p className="text-sm text-muted">{event.actor} · {event.result}{event.detail ? ` · ${event.detail}` : ""}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
