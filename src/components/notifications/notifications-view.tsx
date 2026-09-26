"use client"

import { Bell } from "lucide-react"
import { ActivityTimeline } from "@/components/activity/timeline"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, SectionHeading } from "@/components/ui/kit"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function NotificationsView() {
  const state = useDeployState()
  const now = useNow()
  if (!state) return <PageSkeleton />
  const items = state.activity.slice(0, 12)
  return (
    <div className="page page-stack">
      <PageHeader icon={Bell} kicker="Workspace" title="Notifications" description="Recent changes in this workspace." />
      <section>
        <SectionHeading title="Latest" count={items.length} href="/activity" action="Full activity" />
        {items.length === 0 ? (
          <EmptyPanel icon={Bell} title="No notifications" body="Deployments, domains, and server changes show up here." />
        ) : <ActivityTimeline events={items} now={now} relative />}
      </section>
    </div>
  )
}
