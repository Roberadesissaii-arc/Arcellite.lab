"use client"

import Link from "next/link"
import { Activity, ArrowUpRight, Boxes, Cpu, Network, Radio, RefreshCw, Server, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { IconTile, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { ServerStatusView } from "@/components/ui/status"
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
                  <DetailBlock icon={Cpu} title="Hardware" rows={[
                    ["CPU", `${server.cpuCount} cores · ${server.arch}`],
                    ["Memory", `${formatGb(server.memoryTotalGb)} total`],
                    ["Disk", `${formatGb(server.storageTotalGb)} total`],
                    ["System", server.os],
                  ]} />
                  <DetailBlock icon={Network} title="Network" rows={[
                    ["Address", <span key="a" className="font-mono">{server.ip}</span>],
                    ["Interface", <span key="i" className="font-mono">{server.iface} · {server.cidr}</span>],
                    ["Gateway", <span key="g" className="font-mono">{server.gateway}</span>],
                    ["DNS", <span key="d" className="font-mono">{server.dns.join(", ")}</span>],
                    ["Throughput", `${server.networkMbps} Mbps`],
                  ]} />
                  <DetailBlock icon={Activity} title="Runtime" rows={[
                    ["Docker", <StatusText key="d" ok={server.dockerStatus === "running"} text={`${server.dockerVersion} · ${server.dockerStatus}`} />],
                    ["Agent", <StatusText key="a" ok={server.agentStatus === "connected"} text={`${server.agentVersion} · ${server.agentStatus}`} />],
                    ["Uptime", formatUptime(server.startedAt, now)],
                    ["Last check", server.refreshedAt ? formatRelative(server.refreshedAt, now) : "Live stream"],
                  ]} />
                </div>
                <div className="server-workloads">
                  <p className="server-workloads-title">Workloads on this server <span className="section-count">{containers.length}</span></p>
                  <div className="server-chips">
                    {containers.map((container) => (
                      <Link key={container.id} href={`/containers?inspect=${container.id}`} className="server-chip" data-state={container.state}>
                        <span aria-hidden />{container.name}<small>{container.cpuPercent}% · {container.memoryMb} MB</small>
                      </Link>
                    ))}
                  </div>
                  <div className="server-actions">
                    <Button variant="secondary" size="sm" onClick={() => void deploy.refreshServer(server.id).then(() => toast({ title: "Server refreshed", description: server.name }))}><RefreshCw aria-hidden />Refresh</Button>
                    <Button variant="ghost" size="sm" onClick={() => void deploy.restartAgent(server.id).then(() => toast({ title: "Agent restart requested", description: server.name }))}>Restart agent</Button>
                    <Link href={`/servers/${server.id}`} className="btn btn-ghost btn-sm ml-auto">Open server<ArrowUpRight aria-hidden /></Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Resource({ label, value, meter }: { label: string; value: string; meter: number }) {
  return (
    <div className="resource-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <SegmentMeter value={meter} label={label} />
    </div>
  )
}

function DetailBlock({ icon, title, rows }: { icon: LucideIcon; title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section className="server-detail">
      <p className="server-detail-title"><IconTile icon={icon} tone="neutral" size="sm" />{title}</p>
      <dl>
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  )
}

function StatusText({ ok, text }: { ok: boolean; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="status-pip" data-ok={ok} aria-hidden />{text}</span>
}
