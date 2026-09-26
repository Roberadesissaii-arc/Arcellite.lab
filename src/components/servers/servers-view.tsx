"use client"

import Link from "next/link"
import { Activity, ArrowUpRight, Box, Boxes, Cable, Cog, Database, FolderKanban, GitBranch, Rocket, Clock, Container, Cpu, Gauge, Globe2, HardDrive, History, Layers, MapPin, MemoryStick, Monitor, Network, Plug, Plus, Radio, RefreshCw, Router, Server, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag, type Tone } from "@/components/ui/kit"
import { ContainerStatusView, ServerStatusView } from "@/components/ui/status"
import { formatGb, formatPercent, formatRelative, formatUptime, plural } from "@/lib/deploy/format"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function ServersView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow()
  if (!state) return <PageSkeleton variant="cards" />
  const online = state.servers.filter((server) => server.status === "online").length
  const reporting = state.servers.filter((server) => server.status !== "offline")
  const avgCpu = reporting.length ? reporting.reduce((sum, server) => sum + server.cpuPercent, 0) / reporting.length : 0
  return (
    <div className="page page-stack">
      <PageHeader icon={Server} kicker="Infrastructure" title="Servers" description="Machines this control plane can place work on, with live resource usage from the agent." />
      <StatGrid>
        <StatCard icon={Server} tone="brand" label="Servers" value={state.servers.length} detail="Registered with this workspace" />
        <StatCard icon={Radio} tone={online === state.servers.length ? "success" : "warning"} label="Online" value={online} detail={online === state.servers.length ? "All agents reporting" : "Some agents are quiet"} />
        <StatCard icon={Boxes} tone="info" label="Containers" value={state.containers.length} href="/containers" detail="Across every server" />
        <StatCard icon={Cpu} tone="neutral" label="Average CPU" value={<>{avgCpu.toFixed(0)}<small>%</small></>} detail="Reporting servers only" />
      </StatGrid>
      <section>
        <SectionHeading title="Fleet" count={state.servers.length} />
        <ul className="space-y-4">
          {state.servers.map((server) => {
            const containers = state.containers.filter((item) => item.serverId === server.id)
            const projects = new Set(containers.map((item) => item.projectId).filter(Boolean))
            const ports = containers.flatMap((container) => container.ports.filter((port) => port.host).map((port) => ({ host: port.host, container: port.container, name: container.name })))
            const names = new Set([server.name, ...containers.map((container) => container.name)])
            const events = state.activity.filter((event) => names.has(event.objectName) || event.objectType === "Server").slice(0, 4)
            return (
              <li key={server.id} className="panel">
                <Link href={`/servers/${server.id}`} className="item-row" data-interactive>
                  <IconTile icon={Server} tone={server.status === "online" ? "brand" : server.status === "degraded" ? "warning" : "danger"} size="lg" />
                  <span className="item-main">
                    <span className="item-title text-[15px]">{server.name}</span>
                    <span className="item-subtitle">{server.os} · {server.arch} · <span className="font-mono">{server.ip}</span></span>
                  </span>
                  <span className="item-meta"><Tag>{plural(containers.length, "container")}</Tag></span>
                  <span className="item-meta"><Tag>{plural(projects.size, "project")}</Tag></span>
                  <span className="item-trailing"><ServerStatusView value={server.status} /><ArrowUpRight size={15} className="text-faint" aria-hidden /></span>
                </Link>
                <div className="border-t border-[var(--border-subtle)] px-[18px] py-5">
                  {server.status === "offline" ? (
                    <p className="text-sm text-muted">This server is not reporting. Open it to reconnect.</p>
                  ) : (
                    <dl className="card-grid card-grid-3 !gap-6">
                      <Resource label="CPU" value={formatPercent(server.cpuPercent)} meter={server.cpuPercent} />
                      <Resource label="Memory" value={`${formatGb(server.memoryUsedGb)} / ${formatGb(server.memoryTotalGb)}`} meter={(server.memoryUsedGb / server.memoryTotalGb) * 100} />
                      <Resource label="Storage" value={`${formatGb(server.storageUsedGb)} / ${formatGb(server.storageTotalGb)}`} meter={(server.storageUsedGb / server.storageTotalGb) * 100} />
                    </dl>
                  )}
                </div>
                <div className="server-details">
                  <DetailBlock icon={Cpu} tone="brand" title="Hardware" rows={[
                    ["CPU", <Chip key="c">{server.cpuCount} cores</Chip>, Cpu],
                    ["Architecture", <Chip key="a" mono>{server.arch}</Chip>, Layers],
                    ["Memory", <Chip key="m">{formatGb(server.memoryTotalGb)}</Chip>, MemoryStick],
                    ["Disk", <Chip key="d">{formatGb(server.storageTotalGb)}</Chip>, HardDrive],
                    ["System", <span key="s" className="font-medium text-[var(--text-primary)]">{server.os}</span>, Monitor],
                  ]} />
                  <DetailBlock icon={Network} tone="info" title="Network" rows={[
                    ["Address", <Chip key="a" mono>{server.ip}</Chip>, MapPin],
                    ["Interface", <Chip key="i" mono>{server.iface}</Chip>, Cable],
                    ["Subnet", <Chip key="n" mono>{server.cidr}</Chip>, Network],
                    ["Gateway", <Chip key="g" mono>{server.gateway}</Chip>, Router],
                    ["DNS", <Chip key="d" mono>{server.dns.join(", ")}</Chip>, Globe2],
                  ]} />
                  <DetailBlock icon={Activity} tone="success" title="Runtime" rows={[
                    ["Docker", <StatusText key="d" ok={server.dockerStatus === "running"} text={`${server.dockerVersion} · ${server.dockerStatus}`} />, Container],
                    ["Agent", <StatusText key="a" ok={server.agentStatus === "connected"} text={`${server.agentVersion} · ${server.agentStatus}`} />, Radio],
                    ["Uptime", <Chip key="u">{formatUptime(server.startedAt, now)}</Chip>, Clock],
                    ["Throughput", <Chip key="t">{server.networkMbps} Mbps</Chip>, Gauge],
                    ["Last check", <span key="l" className="font-medium text-[var(--text-primary)]">{server.refreshedAt ? formatRelative(server.refreshedAt, now) : "Live stream"}</span>, RefreshCw],
                  ]} />
                </div>
                <div className="server-bottom">
                  <section>
                    <p className="server-bottom-title"><Plug aria-hidden />Ports in use <span className="section-count">{ports.length}</span></p>
                    <div className="server-ports">
                      {ports.map((port) => <span key={`${port.host}-${port.name}`} className="server-port"><code>:{port.host}</code><small>{port.name} → {port.container}</small></span>)}
                      {ports.length === 0 ? <span className="text-xs text-faint">No published ports.</span> : null}
                    </div>
                  </section>
                  <section>
                    <p className="server-bottom-title"><History aria-hidden />Recent events</p>
                    <ul className="server-events">
                      {events.map((event) => (
                        <li key={event.id}>
                          <IconTile icon={EVENT_ICON[event.objectType] ?? History} tone={event.result === "error" ? "danger" : event.result === "warning" ? "warning" : "brand"} size="sm" />
                          <span className="min-w-0 flex-1"><strong className="block truncate">{event.action}</strong><small className="block truncate">{event.objectType} · {event.objectName}</small></span>
                          <time dateTime={event.timestamp}>{formatRelative(event.timestamp, now)}</time>
                        </li>
                      ))}
                      {events.length === 0 ? <li className="text-faint">No events yet.</li> : null}
                    </ul>
                  </section>
                </div>
                <div className="server-actions">
                  <Button variant="secondary" size="sm" onClick={() => void deploy.refreshServer(server.id).then(() => toast({ title: "Server refreshed", description: server.name }))}><RefreshCw aria-hidden />Refresh</Button>
                  <Button variant="ghost" size="sm" onClick={() => void deploy.restartAgent(server.id).then(() => toast({ title: "Agent restart requested", description: server.name }))}>Restart agent</Button>
                  <Link href={`/servers/${server.id}`} className="btn btn-ghost btn-sm ml-auto">Open server<ArrowUpRight aria-hidden /></Link>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
      {state.servers.map((server) => {
        const containers = state.containers.filter((item) => item.serverId === server.id)
        return (
          <section key={server.id}>
            <SectionHeading title={state.servers.length > 1 ? `Workloads on ${server.name}` : "Workloads on this server"} count={containers.length} href="/containers" action="All containers" />
            {containers.length === 0 ? (
              <EmptyPanel icon={Boxes} title="Nothing running here yet" body="Deploy a project and its containers will show up on this server." />
            ) : (
              <ul className="workload-grid">
                {containers.map((container) => {
                  const project = state.projects.find((item) => item.id === container.projectId)
                  const published = container.ports.filter((port) => port.host)
                  return (
                    <li key={container.id}>
                      <Link href={`/containers?inspect=${container.id}`} className="workload-card" data-state={container.state}>
                        <span className="workload-head">
                          <IconTile icon={ROLE_ICON[container.role]} tone={container.state === "running" ? "brand" : container.state === "stopped" || container.state === "exited" ? "danger" : "info"} />
                          <span className="min-w-0 flex-1">
                            <strong>{container.name}</strong>
                            <small>{project?.name ?? "Standalone"} · {container.role}</small>
                          </span>
                          <ContainerStatusView value={container.state} />
                        </span>
                        <code className="workload-image">{container.image}</code>
                        <span className="workload-meters">
                          <span><small>CPU</small><b>{container.cpuPercent}%</b><SegmentMeter value={container.cpuPercent * 4} label="CPU" /></span>
                          <span><small>Memory</small><b>{container.memoryMb} MB</b><SegmentMeter value={(container.memoryMb / 1024) * 100} label="Memory" /></span>
                        </span>
                        <span className="workload-foot">
                          <Plug aria-hidden />{published.length ? published.map((port) => `:${port.host}`).join(" ") : "Internal only"}
                          <ArrowUpRight aria-hidden className="ml-auto" />
                        </span>
                      </Link>
                    </li>
                  )
                })}
                <li className="workload-slot" data-rem3={(3 - (containers.length % 3)) % 3} data-rem2={containers.length % 2}>
                  <Link href="/projects/new" className="workload-card workload-card-slot">
                    <span className="overview-project-slot-icon"><Plus aria-hidden /></span>
                    <strong>Room for more</strong>
                    <small>{formatGb(server.memoryTotalGb - server.memoryUsedGb)} memory and {formatGb(server.storageTotalGb - server.storageUsedGb)} disk free on {server.name}.</small>
                    <span className="overview-project-slot-cta">Deploy a project<ArrowUpRight aria-hidden /></span>
                  </Link>
                </li>
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

const ROLE_ICON: Record<string, LucideIcon> = { web: Globe2, worker: Cog, data: Database }
const EVENT_ICON: Record<string, LucideIcon> = { Deployment: Rocket, Container: Box, Server: Server, Domain: Globe2, Project: FolderKanban, "Git provider": GitBranch }

function Resource({ label, value, meter }: { label: string; value: string; meter: number }) {
  return (
    <div className="resource-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <SegmentMeter value={meter} label={label} />
    </div>
  )
}

function DetailBlock({ icon, tone, title, rows }: { icon: LucideIcon; tone: Tone; title: string; rows: [string, React.ReactNode, LucideIcon][] }) {
  return (
    <section className="server-detail">
      <p className="server-detail-title"><IconTile icon={icon} tone={tone} size="sm" />{title}</p>
      <dl>
        {rows.map(([label, value, RowIcon]) => <div key={label}><dt><RowIcon aria-hidden />{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  )
}

function Chip({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <span className={mono ? "server-chip-value font-mono" : "server-chip-value"}>{children}</span>
}

function StatusText({ ok, text }: { ok: boolean; text: string }) {
  return <span className="server-status-pill" data-ok={ok}><span className="status-pip" data-ok={ok} aria-hidden />{text}</span>
}
