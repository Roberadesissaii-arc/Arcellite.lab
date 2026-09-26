"use client"

import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
import { formatDateTime } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"

export function EventsView() {
  const state = useDeployState()
  if (!state) return <PageSkeleton />
  return (
    <div className="page">
      <PageHeader title="Events" description="A record of what changed on this server." />
      {state.activity.length === 0 ? (
        <div className="panel mt-6">
          <EmptyState title="No events" body="Deploys, restarts, and domain checks are recorded here." />
        </div>
      ) : (
        <ol className="panel mt-6 divide-y divide-zinc-200">
          {state.activity.map((event) => (
            <li key={event.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
              <time className="text-[13px] text-zinc-500" dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {event.href ? <Link href={event.href}>{event.action}</Link> : event.action}
                  <span className="font-normal text-zinc-500"> · {event.objectName}</span>
                </p>
                {event.detail ? <p className="text-[13px] text-zinc-500">{event.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
