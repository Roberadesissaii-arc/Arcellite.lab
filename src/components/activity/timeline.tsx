"use client"

import Link from "next/link"
import { useState } from "react"
import { Box, ChevronLeft, ChevronRight, FolderGit2, FolderKanban, GitBranch, Globe2, Server, Sparkle, type LucideIcon } from "lucide-react"
import { IconTile, type Tone } from "@/components/ui/kit"
import { formatClock, formatDate, formatRelative } from "@/lib/deploy/format"
import type { ActivityEvent } from "@/lib/deploy/types"

const TYPE_ICON: Record<string, LucideIcon> = {
  Container: Box,
  Deployment: GitBranch,
  Domain: Globe2,
  "Git provider": FolderGit2,
  Project: FolderKanban,
  Server,
}

const RESULT_TONE: Record<ActivityEvent["result"], Tone> = {
  success: "success",
  warning: "warning",
  error: "danger",
  info: "brand",
}

/** Day-grouped vertical timeline shared by Events, Activity, and Notifications. */
export function ActivityTimeline({
  events,
  now,
  showActor = false,
  relative = false,
  pageSize,
}: {
  events: ActivityEvent[]
  now: number
  showActor?: boolean
  relative?: boolean
  /** When set, shows this many events per page with a footer to move between pages. */
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const pages = pageSize ? Math.max(1, Math.ceil(events.length / pageSize)) : 1
  const current = Math.min(page, pages - 1)
  const visible = pageSize ? events.slice(current * pageSize, (current + 1) * pageSize) : events
  const groups: { day: string; items: ActivityEvent[] }[] = []
  for (const event of visible) {
    const day = formatDate(event.timestamp)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(event)
    else groups.push({ day, items: [event] })
  }
  return (
    <div className="panel timeline-wrap">
    <div className="timeline">
      {groups.map((group) => (
        <section key={group.day}>
          <p className="timeline-day">{group.day}</p>
          <ol>
            {group.items.map((event) => (
              <li key={event.id} className="timeline-item">
                <IconTile icon={TYPE_ICON[event.objectType] ?? Sparkle} tone={RESULT_TONE[event.result]} />
                <div className="timeline-body">
                  <p>{event.href ? <Link href={event.href} className="hover:text-[var(--brand-primary)]">{event.action}</Link> : event.action}</p>
                  <p className="timeline-sub">
                    {event.objectType} · <span className="text-[var(--text-secondary)]">{event.objectName}</span>
                    {showActor ? <> · {event.actor}</> : null}
                  </p>
                  {event.detail ? <p className="timeline-sub">{event.detail}</p> : null}
                </div>
                <time className="timeline-time" dateTime={event.timestamp}>{relative ? formatRelative(event.timestamp, now) : formatClock(event.timestamp)}</time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
    {pageSize && events.length > pageSize ? (
      <div className="data-table-footer">
        <p>Showing <strong>{current * pageSize + 1}–{Math.min((current + 1) * pageSize, events.length)}</strong> of <strong>{events.length}</strong></p>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-faint">Page {current + 1} of {pages}</span>
          <button type="button" className="icon-btn pressable" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft aria-hidden /></button>
          <button type="button" className="icon-btn pressable" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight aria-hidden /></button>
        </div>
      </div>
    ) : null}
    </div>
  )
}
