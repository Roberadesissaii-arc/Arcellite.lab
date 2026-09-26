"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowUpRight, Box, CalendarClock, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, FileText, FolderGit2, FolderKanban,
  GalleryVerticalEnd, GitBranch, Globe2, Info, SearchX, Server, Tag as TagIcon, TriangleAlert, UserRound, type LucideIcon,
} from "lucide-react"
import { BadgeAlertIcon, ChartColumnIncreasingIcon, CircleCheckIcon, GalleryVerticalEndIcon } from "lucide-animated"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { EmptyPanel, SearchField, StatCard, StatGrid, Tag, type Tone } from "@/components/ui/kit"
import { formatClock, formatDate, formatDateTime, formatRelative } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import type { ActivityEvent } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

type Result = ActivityEvent["result"]

const TYPE_ICON: Record<string, LucideIcon> = { Container: Box, Deployment: GitBranch, Domain: Globe2, "Git provider": FolderGit2, Project: FolderKanban, Server }
const RESULT: Record<Result, { label: string; tone: Tone; icon: LucideIcon }> = {
  success: { label: "Succeeded", tone: "success", icon: CircleCheck },
  info: { label: "Info", tone: "brand", icon: Info },
  warning: { label: "Warning", tone: "warning", icon: TriangleAlert },
  error: { label: "Error", tone: "danger", icon: CircleAlert },
}
const PAGE_SIZE = 8
const DAY = 24 * 60 * 60 * 1000

function dayLabel(iso: string, now: number) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const time = Date.parse(iso)
  if (time >= start.getTime()) return "Today"
  if (time >= start.getTime() - DAY) return "Yesterday"
  return formatDate(iso)
}

export function EventsView() {
  const state = useDeployState()
  const now = useNow()
  const [result, setResult] = useState<Result | "all">("all")
  const [type, setType] = useState("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  if (!state) return <PageSkeleton />

  const events = state.activity
  const types = [...new Set(events.map((event) => event.objectType))].sort()
  const q = search.trim().toLowerCase()
  const rows = events.filter((event) =>
    (result === "all" || event.result === result)
    && (type === "all" || event.objectType === type)
    && (!q || [event.action, event.objectName, event.actor, event.detail ?? ""].some((text) => text.toLowerCase().includes(q))))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const selected = events.find((event) => event.id === picked) ?? visible[0] ?? null
  const count = (value: Result) => events.filter((event) => event.result === value).length
  const problems = count("warning") + count("error")
  const lastDay = events.filter((event) => Date.parse(event.timestamp) >= now - DAY).length
  const byType = types.map((name) => ({ name, total: events.filter((event) => event.objectType === name).length })).sort((a, b) => b.total - a.total)
  const top = byType[0]?.total ?? 1

  const groups: { label: string; items: ActivityEvent[] }[] = []
  for (const event of visible) {
    const label = dayLabel(event.timestamp, now)
    const group = groups.at(-1)
    if (group?.label === label) group.items.push(event)
    else groups.push({ label, items: [event] })
  }
  const reset = () => setPage(0)

  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={GalleryVerticalEnd} kicker="Observe" title="Events" description="A record of what changed on this server — deploys, restarts, and domain checks, newest first. Select an event to see everything recorded about it." />
      <StatGrid>
        <StatCard icon={GalleryVerticalEnd} animated={GalleryVerticalEndIcon} tone="brand" label="Events" value={events.length} detail={`${types.length} kinds of object`} />
        <StatCard icon={CalendarClock} animated={ChartColumnIncreasingIcon} tone="info" label="Last 24 hours" value={lastDay} detail={lastDay ? "Recent changes" : "A quiet day"} />
        <StatCard icon={CircleCheck} animated={CircleCheckIcon} tone="success" label="Succeeded" value={count("success")} detail={`${events.length ? Math.round((count("success") / events.length) * 100) : 0}% of all events`} />
        <StatCard icon={TriangleAlert} animated={BadgeAlertIcon} tone={problems ? "warning" : "neutral"} label="Warnings & errors" value={problems} href={problems ? "/alerts" : undefined} detail={problems ? "Worth a look" : "Nothing flagged"} />
      </StatGrid>

      <div className="page-toolbar">
        <SearchField value={search} onChange={(value) => { setSearch(value); reset() }} placeholder="Search actions, objects, or people" label="Search events" />
        <div className="segmented" role="group" aria-label="Filter by result">
          {(["all", "success", "info", "warning", "error"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={result === item} onClick={() => { setResult(item); reset() }}>
              {item === "all" ? "All" : RESULT[item].label}<span className="al-seg-count">{item === "all" ? events.length : count(item)}</span>
            </button>
          ))}
        </div>
        <SelectInput aria-label="Object type" value={type} onChange={(event) => { setType(event.target.value); reset() }}>
          <option value="all">Every object</option>
          {types.map((name) => <option key={name} value={name}>{name}</option>)}
        </SelectInput>
      </div>

      {events.length === 0 ? (
        <EmptyPanel icon={GalleryVerticalEnd} title="No events" body="Deploys, restarts, and domain checks are recorded here." />
      ) : (
        <div className="ev-layout">
          <section className="panel ev-stream" aria-label="Event stream">
            {rows.length === 0 ? (
              <div className="al-clear">
                <span className="al-clear-icon ev-none"><SearchX aria-hidden /></span>
                <strong>No events match</strong>
                <small>Try another result, object, or search.</small>
              </div>
            ) : (
              <div className="ev-groups">
                {groups.map((group) => (
                  <div key={group.label} className="ev-group">
                    <p className="ev-day">{group.label}<span>{group.items.length}</span></p>
                    <ul>
                      {group.items.map((event) => {
                        const Icon = TYPE_ICON[event.objectType] ?? GalleryVerticalEnd
                        return (
                          <li key={event.id}>
                            <button type="button" className="ev-row" data-active={selected?.id === event.id} data-result={event.result} onClick={() => setPicked(event.id)}>
                              <span className="ev-icon"><Icon aria-hidden /></span>
                              <span className="min-w-0 flex-1">
                                <strong>{event.action}</strong>
                                <small>{event.objectType} · {event.objectName}</small>
                              </span>
                              <span className="ev-result" data-result={event.result}>{RESULT[event.result].label}</span>
                              <time dateTime={event.timestamp}>{formatClock(event.timestamp)}</time>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <footer className="ev-pager">
              <span>{rows.length ? `${current * PAGE_SIZE + 1}–${Math.min(rows.length, (current + 1) * PAGE_SIZE)} of ${rows.length}` : "0 events"}</span>
              <span className="flex gap-1">
                <button type="button" className="icon-btn" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft aria-hidden /></button>
                <button type="button" className="icon-btn" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight aria-hidden /></button>
              </span>
            </footer>
          </section>

          <aside className="ev-aside">
            {selected ? (() => {
              const Icon = TYPE_ICON[selected.objectType] ?? GalleryVerticalEnd
              const meta = RESULT[selected.result]
              return (
                <div className="panel ev-detail" data-result={selected.result}>
                  <div className="ev-detail-head">
                    <span className="ev-icon ev-icon-lg"><Icon aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <strong>{selected.action}</strong>
                      <small>{selected.objectName}</small>
                    </span>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                  </div>
                  <dl className="ev-fields">
                    <div><dt><TagIcon aria-hidden />Object</dt><dd>{selected.objectType}</dd></div>
                    <div><dt><UserRound aria-hidden />Actor</dt><dd>{selected.actor}</dd></div>
                    <div><dt><CalendarClock aria-hidden />When</dt><dd>{formatDateTime(selected.timestamp)}<small>{formatRelative(selected.timestamp, now)}</small></dd></div>
                    <div><dt><FileText aria-hidden />Detail</dt><dd>{selected.detail ?? <span className="text-faint">No extra detail recorded.</span>}</dd></div>
                  </dl>
                  {selected.href ? <Link href={selected.href} className="btn btn-secondary btn-sm ev-open">Open {selected.objectType.toLowerCase()}<ArrowUpRight aria-hidden /></Link> : null}
                </div>
              )
            })() : null}
            <div className="panel ev-breakdown">
              <p className="ev-breakdown-title">By object</p>
              <ul>
                {byType.map((item) => {
                  const Icon = TYPE_ICON[item.name] ?? GalleryVerticalEnd
                  return (
                    <li key={item.name}>
                      <button type="button" data-active={type === item.name} onClick={() => { setType(type === item.name ? "all" : item.name); reset() }}>
                        <Icon aria-hidden /><span className="flex-1 text-left">{item.name}</span><b>{item.total}</b>
                        <i style={{ width: `${(item.total / top) * 100}%` }} aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="ev-breakdown-note">Select an object to filter the stream.</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
