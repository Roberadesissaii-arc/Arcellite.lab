"use client"

import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
import { formatRelative } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function NotificationsView() {
  const state = useDeployState()
  const now = useNow()
  if (!state) return <PageSkeleton />
  const items = state.activity.slice(0, 12)
  return (
    <div className="page">
      <PageHeader title="Notifications" description="Recent changes in this workspace." />
      {items.length === 0 ? (
        <div className="panel mt-6">
          <EmptyState title="No notifications" body="Deployments, domains, and server changes show up here." />
        </div>
      ) : (
        <ul className="panel mt-6 divide-y divide-zinc-200">
          {items.map((event) => (
            <li key={event.id}>
              {event.href ? (
                <Link href={event.href} className="block px-4 py-3">
                  <span className="block text-sm font-medium text-zinc-900">{event.action}</span>
                  <span className="text-sm text-zinc-600">
                    {event.objectName} · {formatRelative(event.timestamp, now)}
                  </span>
                </Link>
              ) : (
                <div className="px-4 py-3">
                  <span className="block text-sm font-medium text-zinc-900">{event.action}</span>
                  <span className="text-sm text-zinc-600">{event.objectName}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
