"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArchiveRestore, ArrowUpRight, BellRing, Box, Check, CircleAlert, Cpu, EyeOff, Globe2, HardDrive, History, Info, Mail, MemoryStick, RotateCcw,
  Rocket, ShieldCheck, TriangleAlert, Unplug, type LucideIcon,
} from "lucide-react"
import { BadgeAlertIcon, BellIcon, FlameIcon, ShieldCheckIcon } from "lucide-animated"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { formatRelative } from "@/lib/deploy/format"
import { homeServer, latestDeployment, projectBadge } from "@/lib/deploy/helpers"
import { useDeployState } from "@/lib/deploy/react"
import type { AppState } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

type Severity = "critical" | "warning" | "info"

interface Alert {
  id: string
  severity: Severity
  icon: LucideIcon
  title: string
  body: string
  source: string
  href: string
  action: string
  since: string | null
}

interface Check {
  label: string
  icon: LucideIcon
  state: "pass" | "warn" | "fail"
  note: string
}

const SEVERITY: Record<Severity, { label: string; icon: LucideIcon; order: number }> = {
  critical: { label: "Critical", icon: CircleAlert, order: 0 },
  warning: { label: "Warning", icon: TriangleAlert, order: 1 },
  info: { label: "Info", icon: Info, order: 2 },
}

function collect(state: AppState, now: number): { alerts: Alert[]; checks: Check[] } {
  const alerts: Alert[] = []
  const server = homeServer(state)
  if (server?.status === "offline") {
    alerts.push({ id: "server-offline", severity: "critical", icon: Unplug, title: "Server offline", body: `${server.name} stopped sending heartbeats. Nothing new can be placed on it.`, source: server.name, href: `/servers/${server.id}`, action: "Reconnect", since: server.refreshedAt })
  } else if (server?.status === "degraded") {
    alerts.push({ id: "server-degraded", severity: "warning", icon: Unplug, title: "Server degraded", body: `${server.name} is reporting, but slowly. Check the agent.`, source: server.name, href: `/servers/${server.id}`, action: "Open server", since: server.refreshedAt })
  }
  const failed = state.projects.flatMap((project) => {
    const latest = latestDeployment(state.deployments, project.id, now)
    return projectBadge(project, latest) === "failed" ? [{ project, latest }] : []
  })
  for (const { project, latest } of failed) {
    alerts.push({ id: `deploy-${project.id}`, severity: "critical", icon: Rocket, title: "Deployment failed", body: `The latest release of ${project.name} did not finish. The previous version keeps serving.`, source: project.name, href: latest ? `/deployments/${latest.id}` : `/projects/${project.id}`, action: "Read build log", since: latest?.finishedAt ?? latest?.createdAt ?? null })
  }
  for (const domain of state.domains) {
    if (domain.status === "invalid") alerts.push({ id: `domain-${domain.id}`, severity: "critical", icon: Globe2, title: "Domain verification failed", body: domain.error ?? `${domain.name} does not point at this server.`, source: domain.name, href: "/domains", action: "Fix DNS", since: domain.verifyStartedAt ?? domain.createdAt })
    else if (domain.status === "dns-required" || domain.status === "verifying" || domain.status === "pending") alerts.push({ id: `domain-${domain.id}`, severity: "warning", icon: Globe2, title: "Waiting for DNS", body: `${domain.name} needs its records before a certificate can be issued.`, source: domain.name, href: "/domains", action: "View records", since: domain.createdAt })
  }
  for (const container of state.containers.filter((item) => item.state === "stopped" || item.state === "exited")) {
    alerts.push({ id: `container-${container.id}`, severity: "warning", icon: Box, title: `Container ${container.state}`, body: `${container.name} is not running. Anything that depends on it is unavailable.`, source: container.name, href: `/containers?inspect=${container.id}`, action: "Inspect", since: container.stateChangedAt })
  }
  const disk = server ? (server.storageUsedGb / server.storageTotalGb) * 100 : 0
  const memory = server ? (server.memoryUsedGb / server.memoryTotalGb) * 100 : 0
  if (server && disk >= 80) alerts.push({ id: "disk", severity: disk >= 92 ? "critical" : "warning", icon: HardDrive, title: "Disk almost full", body: `${disk.toFixed(0)}% of ${server.name}'s disk is used. Builds fail when it runs out.`, source: server.name, href: "/storage", action: "Review storage", since: null })
  if (server && memory >= 85) alerts.push({ id: "memory", severity: "warning", icon: MemoryStick, title: "Memory pressure", body: `${memory.toFixed(0)}% of memory is in use on ${server.name}.`, source: server.name, href: "/metrics", action: "Open metrics", since: null })
  if (server && server.cpuPercent >= 90) alerts.push({ id: "cpu", severity: "warning", icon: Cpu, title: "CPU saturated", body: `${server.name} is at ${server.cpuPercent}% CPU.`, source: server.name, href: "/metrics", action: "Open metrics", since: null })
  const unbacked = state.volumes.filter((volume) => !volume.lastBackupAt)
  for (const volume of unbacked) {
    alerts.push({ id: `backup-${volume.id}`, severity: "info", icon: ArchiveRestore, title: "Volume has no backup", body: `${volume.name} (${volume.sizeGb} GB) has never been backed up.`, source: volume.attachmentLabel, href: "/storage", action: "View volume", since: volume.createdAt })
  }
  if (!state.settings.redactSecrets) alerts.push({ id: "redaction", severity: "warning", icon: EyeOff, title: "Secret redaction is off", body: "Secret values can appear in build and runtime logs.", source: "Workspace settings", href: "/settings?section=Security", action: "Turn on", since: null })

  const pending = state.domains.filter((domain) => domain.status !== "active" && domain.status !== "issuing")
  const stopped = state.containers.filter((item) => item.state === "stopped" || item.state === "exited")
  const checks: Check[] = [
    { label: "Server heartbeat", icon: Unplug, state: !server || server.status === "offline" ? "fail" : server.status === "degraded" ? "warn" : "pass", note: server ? (server.status === "online" ? "Agent connected" : server.status) : "No server" },
    { label: "Latest releases", icon: Rocket, state: failed.length ? "fail" : "pass", note: failed.length ? `${failed.length} failed` : "All healthy" },
    { label: "Domains", icon: Globe2, state: state.domains.some((domain) => domain.status === "invalid") ? "fail" : pending.length ? "warn" : "pass", note: pending.length ? `${pending.length} pending` : "All verified" },
    { label: "Containers", icon: Box, state: stopped.length ? "warn" : "pass", note: stopped.length ? `${stopped.length} stopped` : `${state.containers.length} running` },
    { label: "Disk space", icon: HardDrive, state: disk >= 92 ? "fail" : disk >= 80 ? "warn" : "pass", note: `${disk.toFixed(0)}% used` },
    { label: "Memory", icon: MemoryStick, state: memory >= 85 ? "warn" : "pass", note: `${memory.toFixed(0)}% used` },
    { label: "Backups", icon: ArchiveRestore, state: unbacked.length ? "warn" : "pass", note: unbacked.length ? `${unbacked.length} missing` : "Every volume" },
    { label: "Log redaction", icon: EyeOff, state: state.settings.redactSecrets ? "pass" : "warn", note: state.settings.redactSecrets ? "On" : "Off" },
  ]
  alerts.sort((a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order)
  return { alerts, checks }
}

export function AlertsView() {
  const state = useDeployState()
  const now = useNow()
  const [filter, setFilter] = useState<Severity | "all">("all")
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  if (!state) return <PageSkeleton />
  const { alerts, checks } = collect(state, now)
  const open = alerts.filter((alert) => !acknowledged.includes(alert.id))
  const acked = alerts.filter((alert) => acknowledged.includes(alert.id))
  const shown = open.filter((alert) => filter === "all" || alert.severity === filter)
  const count = (severity: Severity) => open.filter((alert) => alert.severity === severity).length
  const passing = checks.filter((check) => check.state === "pass").length
  const critical = count("critical")
  const settings = state.settings
  const resolved = state.activity.filter((event) => event.result === "success").slice(0, 6)
  const routes = [
    { label: "Failed deployments", on: settings.notifyDeployFailure },
    { label: "Domain problems", on: settings.notifyDomains },
    { label: "Server status", on: settings.notifyServer },
    { label: "Successful deployments", on: settings.notifyDeploySuccess },
  ]

  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={ShieldCheck} kicker="Observe" title="Alerts" description="Anything on this server that needs a look, ordered by how urgent it is. Acknowledge an alert to move it out of the way." />
      <StatGrid>
        <StatCard icon={BellRing} animated={BellIcon} tone={open.length ? "brand" : "success"} label="Open alerts" value={open.length} detail={acked.length ? `${acked.length} acknowledged` : "Across every source"} />
        <StatCard icon={CircleAlert} animated={FlameIcon} tone={critical ? "danger" : "success"} label="Critical" value={critical} detail={critical ? "Act on these first" : "Nothing critical"} />
        <StatCard icon={TriangleAlert} animated={BadgeAlertIcon} tone={count("warning") ? "warning" : "neutral"} label="Warnings" value={count("warning")} detail="Worth a look soon" />
        <StatCard icon={ShieldCheck} animated={ShieldCheckIcon} tone={passing === checks.length ? "success" : "info"} label="Checks passing" value={`${passing}/${checks.length}`} detail="Health checks below" />
      </StatGrid>

      <div className="al-layout">
        <section className="al-main">
          <div className="al-toolbar">
            <h2 className="al-heading">Open alerts <span className="section-count">{open.length}</span></h2>
            <div className="segmented" role="group" aria-label="Filter by severity">
              {(["all", "critical", "warning", "info"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
                  {item === "all" ? "All" : SEVERITY[item].label}<span className="al-seg-count">{item === "all" ? open.length : count(item)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel al-feed">
            {shown.length === 0 ? (
              <div className="al-clear">
                <span className="al-clear-icon"><Check aria-hidden /></span>
                <strong>{open.length ? "Nothing at this level" : "All clear"}</strong>
                <small>{open.length ? "Pick another severity to see the rest." : "Servers are online and the latest releases are healthy."}</small>
              </div>
            ) : (
              <ul>
                {shown.map((alert) => {
                  const Icon = alert.icon
                  return (
                    <li key={alert.id} className="al-item" data-severity={alert.severity}>
                      <span className="al-icon"><Icon aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <p className="al-title">{alert.title}<span className="al-sev">{SEVERITY[alert.severity].label}</span></p>
                        <p className="al-body">{alert.body}</p>
                        <p className="al-meta"><span>{alert.source}</span>{alert.since ? <><i aria-hidden />Since {formatRelative(alert.since, now)}</> : <><i aria-hidden />Live</>}</p>
                      </div>
                      <div className="al-actions">
                        <Link href={alert.href} className="btn btn-secondary btn-sm">{alert.action}<ArrowUpRight aria-hidden /></Link>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAcknowledged([...acknowledged, alert.id])}>Acknowledge</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="al-resolved">
              <p className="al-resolved-title"><History aria-hidden />Resolved recently</p>
              <ul>
                {resolved.map((event) => (
                  <li key={event.id}>
                    <span className="al-resolved-dot"><Check aria-hidden /></span>
                    <span className="min-w-0 flex-1 truncate"><strong>{event.action}</strong> · {event.objectName}</span>
                    <time dateTime={event.timestamp}>{formatRelative(event.timestamp, now)}</time>
                  </li>
                ))}
                {resolved.length === 0 ? <li className="text-faint">Nothing resolved yet.</li> : null}
              </ul>
              <Link href="/events" className="al-routes-link">All events<ArrowUpRight aria-hidden /></Link>
            </div>
            {acked.length ? (
              <div className="al-acked">
                <p>Acknowledged <span className="section-count">{acked.length}</span></p>
                <ul>
                  {acked.map((alert) => (
                    <li key={alert.id}>
                      <Check aria-hidden /><span className="min-w-0 flex-1 truncate">{alert.title} · {alert.source}</span>
                      <button type="button" onClick={() => setAcknowledged(acknowledged.filter((id) => id !== alert.id))}><RotateCcw aria-hidden />Reopen</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="al-aside">
          <h2 className="al-heading">Health checks</h2>
          <div className="panel al-checks">
            <div className="al-score">
              <span className="al-ring" style={{ "--pct": `${(passing / checks.length) * 100}%` } as React.CSSProperties}><strong>{passing}</strong><small>of {checks.length}</small></span>
              <span><strong>{passing === checks.length ? "Everything checks out" : `${checks.length - passing} ${checks.length - passing === 1 ? "check needs" : "checks need"} attention`}</strong><small>Re-evaluated every time the agent reports.</small></span>
            </div>
            <ul>
              {checks.map((check) => {
                const Icon = check.icon
                return (
                  <li key={check.label} data-state={check.state}>
                    <Icon aria-hidden className="al-check-icon" />
                    <span className="flex-1">{check.label}</span>
                    <small>{check.note}</small>
                    <span className="al-check-state" aria-label={check.state}>{check.state === "pass" ? <Check aria-hidden /> : check.state === "warn" ? <TriangleAlert aria-hidden /> : <CircleAlert aria-hidden />}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      </div>
      <section className="panel al-routes">
        <p className="al-routes-title"><Mail aria-hidden />Where alerts go<small>Delivered in the app and to your inbox.</small></p>
        <ul>
          {routes.map((route) => (
            <li key={route.label}><span className="flex-1">{route.label}</span><Tag tone={route.on ? "success" : "neutral"}>{route.on ? "Notify" : "Muted"}</Tag></li>
          ))}
        </ul>
        <Link href="/settings?section=Notifications" className="al-routes-link">Notification settings<ArrowUpRight aria-hidden /></Link>
      </section>
    </div>
  )
}
