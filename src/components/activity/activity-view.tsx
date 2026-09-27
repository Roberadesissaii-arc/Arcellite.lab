"use client"

import { useState } from "react"
import { CalendarClock, GalleryVerticalEnd, MonitorDot, TriangleAlert, UserRound } from "lucide-react"
import { ActivityTimeline } from "@/components/activity/timeline"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, SectionHeading, StatCard, StatGrid } from "@/components/ui/kit"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

const FILTERS = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
] as const

export function ActivityView() {
  const state = useDeployState()
  const now = useNow()
  const [result, setResult] = useState<(typeof FILTERS)[number]["value"]>("all")
  if (!state) return <PageSkeleton />
  const rows = state.activity.filter((event) => result === "all" || event.result === result)
  const lastDay = state.activity.filter((event) => Date.parse(event.timestamp) >= now - 24 * 60 * 60 * 1000).length
  const mine = state.activity.filter((event) => event.actor === state.settings.displayName).length
  const problems = state.activity.filter((event) => event.result === "warning" || event.result === "error").length
  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={MonitorDot} kicker="Observe" title="Activity" description="What changed in this workspace, and who did it." />
      <StatGrid>
        <StatCard icon={GalleryVerticalEnd} tone="brand" label="Events" value={state.activity.length} detail="In the audit log" />
        <StatCard icon={CalendarClock} tone="info" label="Last 24 hours" value={lastDay} detail={lastDay ? "Recent changes" : "A quiet day"} />
        <StatCard icon={UserRound} tone="neutral" label="By you" value={mine} detail={state.settings.displayName} />
        <StatCard icon={TriangleAlert} tone={problems ? "warning" : "success"} label="Needs a look" value={problems} detail={problems ? "Warnings and errors" : "Nothing flagged"} href={problems ? "/alerts" : undefined} />
      </StatGrid>
      <section>
        <SectionHeading title="Audit log" count={rows.length} />
        <div className="page-toolbar">
          <div className="segmented" role="group" aria-label="Filter by result">
            {FILTERS.map((item) => (
              <button key={item.value} type="button" aria-pressed={result === item.value} onClick={() => setResult(item.value)}>
                {item.label}
                <span className="ml-1.5 text-[10px] text-faint tabular-nums">{item.value === "all" ? state.activity.length : state.activity.filter((event) => event.result === item.value).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          {rows.length === 0 ? <EmptyPanel icon={MonitorDot} title="No activity" body="Actions you take in this workspace will show up here." /> : <ActivityTimeline key={result} events={rows} now={now} showActor pageSize={6} />}
        </div>
      </section>
    </div>
  )
}
