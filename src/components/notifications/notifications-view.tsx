"use client"

import { useState } from "react"
import { Bell } from "lucide-react"
import { ActivityTimeline } from "@/components/activity/timeline"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, SectionHeading } from "@/components/ui/kit"
import { useDeployState } from "@/lib/deploy/react"
import type { ActivityEvent } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

const CATEGORIES = [
  { id: "all", label: "All", match: () => true },
  { id: "deployments", label: "Deployments", match: (event: ActivityEvent) => event.objectType === "Deployment" },
  { id: "domains", label: "Domains", match: (event: ActivityEvent) => event.objectType === "Domain" },
  { id: "infrastructure", label: "Infrastructure", match: (event: ActivityEvent) => event.objectType === "Server" || event.objectType === "Container" },
  { id: "workspace", label: "Workspace", match: (event: ActivityEvent) => event.objectType === "Project" || event.objectType === "Git provider" },
] as const

export function NotificationsView() {
  const state = useDeployState()
  const now = useNow()
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("all")
  if (!state) return <PageSkeleton variant="list" />
  const settings = state.settings
  const allowed = state.activity.filter((event) => {
    if (event.objectType === "Deployment") return event.result === "success" ? settings.notifyDeploySuccess : event.result === "error" ? settings.notifyDeployFailure : true
    if (event.objectType === "Domain") return settings.notifyDomains
    if (event.objectType === "Server" || event.objectType === "Container") return settings.notifyServer
    return true
  })
  const active = CATEGORIES.find((item) => item.id === category) ?? CATEGORIES[0]
  const items = allowed.filter(active.match)
  return (
    <div className="page page-stack">
      <PageHeader icon={Bell} kicker="Workspace" title="Notifications" description="Recent changes in this workspace." />
      <section>
        <SectionHeading title="Inbox" count={items.length} href="/settings" action="Notification settings" />
        <div className="page-toolbar mb-3">
          <div className="segmented" role="group" aria-label="Filter notifications">
            {CATEGORIES.map((item) => (
              <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
                {item.label}<span className="ml-1.5 text-[10px] text-faint tabular-nums">{allowed.filter(item.match).length}</span>
              </button>
            ))}
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyPanel icon={Bell} title="No notifications" body="Deployments, domains, and server changes show up here. Check Settings → Notifications if you expected something." />
        ) : <ActivityTimeline key={category} events={items} now={now} relative pageSize={6} />}
      </section>
    </div>
  )
}
