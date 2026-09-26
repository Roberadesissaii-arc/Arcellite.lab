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
  const settings = state.settings
  const items = state.activity.filter((event) => {
    if (event.objectType === "Deployment") return event.result === "success" ? settings.notifyDeploySuccess : event.result === "error" ? settings.notifyDeployFailure : true
    if (event.objectType === "Domain") return settings.notifyDomains
    if (event.objectType === "Server" || event.objectType === "Container") return settings.notifyServer
    return true
  }).slice(0, 12)
  return (
    <div className="page page-stack">
      <PageHeader icon={Bell} kicker="Workspace" title="Notifications" description="Recent changes in this workspace." />
      <section>
        <SectionHeading title="Latest" count={items.length} href="/settings" action="Notification settings" />
        {items.length === 0 ? (
          <EmptyPanel icon={Bell} title="No notifications" body="Deployments, domains, and server changes show up here. Check Settings → Notifications if you expected something." />
        ) : <ActivityTimeline events={items} now={now} relative />}
      </section>
    </div>
  )
}
