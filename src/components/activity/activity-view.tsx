"use client"

import { useState } from "react"
import { MonitorDot } from "lucide-react"
import { ActivityTimeline } from "@/components/activity/timeline"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, SectionHeading } from "@/components/ui/kit"
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
  return (
    <div className="page page-stack">
      <PageHeader icon={MonitorDot} kicker="Observe" title="Activity" description="What changed in this workspace, and who did it." />
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
