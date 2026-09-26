"use client"

import { CircleAlert, CircleCheck, GalleryVerticalEnd, Info } from "lucide-react"
import { ActivityTimeline } from "@/components/activity/timeline"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, SectionHeading, StatCard, StatGrid } from "@/components/ui/kit"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function EventsView() {
  const state = useDeployState()
  const now = useNow()
  if (!state) return <PageSkeleton />
  const count = (result: string) => state.activity.filter((event) => event.result === result).length
  const problems = count("error") + count("warning")
  return (
    <div className="page page-stack">
      <PageHeader icon={GalleryVerticalEnd} kicker="Observe" title="Events" description="A record of what changed on this server — deploys, restarts, and domain checks, newest first." />
      <StatGrid>
        <StatCard icon={GalleryVerticalEnd} tone="brand" label="Events" value={state.activity.length} detail="Recorded on this server" />
        <StatCard icon={CircleCheck} tone="success" label="Succeeded" value={count("success")} detail="Completed without issues" />
        <StatCard icon={Info} tone="info" label="Informational" value={count("info")} detail="State changes" />
        <StatCard icon={CircleAlert} tone={problems ? "warning" : "neutral"} label="Warnings & errors" value={problems} detail={problems ? "Worth a look" : "Nothing flagged"} />
      </StatGrid>
      <section>
        <SectionHeading title="Timeline" count={state.activity.length} />
        {state.activity.length === 0 ? (
          <EmptyPanel icon={GalleryVerticalEnd} title="No events" body="Deploys, restarts, and domain checks are recorded here." />
        ) : <ActivityTimeline events={state.activity} now={now} />}
      </section>
    </div>
  )
}
