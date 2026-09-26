"use client"

import Link from "next/link"
import { ArrowUpRight, Bell, CircleUser, GitBranch, Lock, Rocket, Settings } from "lucide-react"
import { ActivityTimeline } from "@/components/activity/timeline"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/ui/bits"
import { Field, TextInput } from "@/components/ui/fields"
import { EmptyPanel, IconTile, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { useToast } from "@/components/ui/toast"
import { formatDate } from "@/lib/deploy/format"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"
}

export function ProfileView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow(15000)
  if (!state) return <PageSkeleton variant="detail" />
  const name = state.settings.displayName
  const mine = state.activity.filter((event) => event.actor === name)
  const deploys = mine.filter((event) => event.objectType === "Deployment").length
  const firstSeen = [...state.activity].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0]?.timestamp

  return (
    <div className="page page-stack">
      <PageHeader icon={CircleUser} kicker="Account" title="Profile" description="How you appear in this workspace. Workspace-wide preferences live in Settings." />

      <section className="profile-card">
        <span className="profile-avatar" aria-hidden>{initialsOf(name)}<span className="profile-online" /></span>
        <div className="min-w-0 flex-1">
          <h2>{name}</h2>
          <p>{state.settings.workspaceName} · <span className="text-faint">{state.settings.timezone}</span></p>
          <div className="mt-3 flex flex-wrap gap-1.5"><Tag tone="brand">Owner</Tag><Tag>Self-hosted</Tag>{state.github.connected ? <Tag tone="success">GitHub @{state.github.accountLogin}</Tag> : null}</div>
        </div>
        <Link href="/settings" className="btn btn-secondary"><Settings aria-hidden />Workspace settings</Link>
      </section>

      <StatGrid>
        <StatCard icon={Rocket} tone="brand" label="Your deployments" value={deploys} href="/deployments" detail="Started by you" />
        <StatCard icon={GitBranch} tone="info" label="Your actions" value={mine.length} href="/activity" detail="In the audit log" />
        <StatCard icon={Lock} tone="success" label="Role" value="Owner" detail="Full access to this workspace" />
        <StatCard icon={CircleUser} tone="neutral" label="Member since" value={firstSeen ? formatDate(firstSeen) : "—"} detail="First recorded activity" />
      </StatGrid>

      <div className="profile-grid">
        <section>
          <SectionHeading title="Your details" />
          <form className="card space-y-4" onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const next = String(data.get("name") || "").trim()
            if (!next) return
            void deploy.updateSettings({ displayName: next }).then(() => toast({ title: "Profile updated", description: next }))
          }}>
            <Field label="Display name" hint="Shown in the sidebar, greetings, and the audit log."><TextInput name="name" defaultValue={name} key={name} /></Field>
            <Field label="Role" hint="Phase 1 has a single owner. Invitations come with real sign-in."><TextInput value="Owner" disabled readOnly /></Field>
            <div className="flex justify-end"><Button type="submit" variant="primary" size="sm">Save profile</Button></div>
          </form>
          <SectionHeading title="Shortcuts" />
          <div className="card profile-links">
            {[
              { href: "/settings?section=Notifications", icon: Bell, title: "Notification preferences", body: "Choose what reaches your inbox." },
              { href: "/settings?section=Security", icon: Lock, title: "Security", body: "Redaction, retention, and access." },
              { href: "/settings?section=Appearance", icon: Settings, title: "Appearance", body: "Motion and shell appearance." },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="profile-link">
                <IconTile icon={item.icon} tone="neutral" size="sm" />
                <span className="min-w-0 flex-1"><strong>{item.title}</strong><small>{item.body}</small></span>
                <ArrowUpRight aria-hidden />
              </Link>
            ))}
          </div>
        </section>
        <section className="min-w-0">
          <SectionHeading title="Your recent activity" count={mine.length} href="/activity" action="All activity" />
          {mine.length ? <ActivityTimeline events={mine} now={now} relative pageSize={5} /> : <EmptyPanel icon={GitBranch} title="Nothing yet" body="Deploys, domain changes, and settings you change appear here." />}
        </section>
      </div>
    </div>
  )
}
