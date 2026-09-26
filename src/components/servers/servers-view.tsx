"use client"

import Link from "next/link"
import { ArrowUpRight, Boxes, Cpu, Radio, Server } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { IconTile, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { ServerStatusView } from "@/components/ui/status"
import { formatGb, formatPercent, formatUptime, plural } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function ServersView() {
  const state = useDeployState()
  const now = useNow()
  if (!state) return <PageSkeleton />
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
                  <p className="mt-4 text-[11px] text-faint">Docker {server.dockerVersion} · Agent {server.agentVersion} · Up {formatUptime(server.startedAt, now)}</p>
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
