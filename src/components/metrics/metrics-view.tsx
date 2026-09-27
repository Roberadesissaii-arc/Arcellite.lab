"use client"

import { useState } from "react"
import { Boxes, Clock, Cpu, Gauge, HardDrive, MemoryStick, Network, RefreshCw, Server, type LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton, Sparkline } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { EmptyPanel, IconTile, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { useToast } from "@/components/ui/toast"
import { formatGb, formatPercent, formatRelative, formatUptime } from "@/lib/deploy/format"
import { useDeploy, useDeployState, useServerMetrics } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

const RANGES = [
  { hours: 12, label: "12h" },
  { hours: 24, label: "24h" },
  { hours: 36, label: "36h" },
] as const

function summary(values: number[]) {
  if (!values.length) return { peak: 0, avg: 0, low: 0 }
  return {
    peak: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    low: Math.min(...values),
  }
}

export function MetricsView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow()
  const [serverId, setServerId] = useState(state?.servers[0]?.id ?? "")
  const [hours, setHours] = useState<(typeof RANGES)[number]["hours"]>(24)
  const server = state ? state.servers.find((item) => item.id === (serverId || state.servers[0]?.id)) ?? state.servers[0] : undefined
  const metrics = useServerMetrics(server?.id)
  if (!state) return <PageSkeleton variant="cards" />
  if (!server || !metrics) return <div className="page"><EmptyPanel icon={Gauge} title="No server to measure" body="Connect a server to see telemetry." /></div>
  const slice = (values: number[]) => values.slice(-hours)
  const memoryPct = (metrics.memoryUsedGb / metrics.memoryTotalGb) * 100
  const diskPct = (metrics.storageUsedGb / metrics.storageTotalGb) * 100
  const containers = state.containers
    .filter((container) => container.serverId === server.id)
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
  const maxCpu = Math.max(1, ...containers.map((container) => container.cpuPercent))
  const maxMem = Math.max(1, ...containers.map((container) => container.memoryMb))
  const memoryMb = containers.reduce((sum, container) => sum + container.memoryMb, 0)
  const headroom = [
    { label: "CPU", pct: metrics.cpu, free: `${(100 - metrics.cpu).toFixed(0)}% idle` },
    { label: "Memory", pct: memoryPct, free: `${formatGb(metrics.memoryTotalGb - metrics.memoryUsedGb)} free` },
    { label: "Disk", pct: diskPct, free: `${formatGb(metrics.storageTotalGb - metrics.storageUsedGb)} free` },
  ]

  return (
    <div className="page page-wide page-stack">
      <PageHeader
        icon={Gauge}
        kicker="Observe"
        title="Metrics"
        description="Recent samples from the selected server. The series is deterministic demo telemetry."
        actions={<Button variant="primary" onClick={() => void deploy.refreshServer(server.id).then(() => toast({ title: "Metrics refreshed", description: server.name }))}><RefreshCw aria-hidden />Refresh</Button>}
      />
      {!metrics.available ? (
        <EmptyPanel icon={Gauge} title="Telemetry paused" body={`${metrics.reason} Reconnect the server to see telemetry again.`} />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={Cpu} tone="brand" label="CPU" value={<>{metrics.cpu.toFixed(0)}<small>%</small></>} detail={`${server.cpuCount} cores · peak ${summary(slice(metrics.series.cpu)).peak.toFixed(0)}%`} />
            <StatCard icon={MemoryStick} tone="info" label="Memory" value={formatGb(metrics.memoryUsedGb)} detail={`${memoryPct.toFixed(0)}% of ${formatGb(metrics.memoryTotalGb)}`} />
            <StatCard icon={Boxes} tone="success" label="Running containers" value={`${metrics.runningContainers}/${metrics.containerCount}`} href="/containers" detail={`${metrics.deploymentCount} ready deployments`} />
            <StatCard icon={Clock} tone="neutral" label="Uptime" value={formatUptime(server.startedAt, now)} detail={server.refreshedAt ? `Sampled ${formatRelative(server.refreshedAt, now)}` : "Live agent stream"} />
          </StatGrid>

          <section>
            <SectionHeading
              title={`Last ${hours} hours`}
              aside={<div className="flex items-center gap-2">{state.servers.length > 1 ? (
                <SelectInput aria-label="Server" value={server.id} onChange={(event) => setServerId(event.target.value)} className="min-w-[180px]">
                  {state.servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectInput>
              ) : null}<div className="segmented" role="group" aria-label="Time range">{RANGES.map((range) => <button key={range.hours} type="button" aria-pressed={hours === range.hours} onClick={() => setHours(range.hours)}>{range.label}</button>)}</div></div>}
            />
            <div className="card-grid">
              <Metric icon={Cpu} label="CPU" value={formatPercent(metrics.cpu)} series={slice(metrics.series.cpu)} format={formatPercent} />
              <Metric icon={MemoryStick} label="Memory" value={`${formatGb(metrics.memoryUsedGb)} / ${formatGb(metrics.memoryTotalGb)}`} series={slice(metrics.series.memory)} format={(value) => `${value.toFixed(1)}%`} />
              <Metric icon={HardDrive} label="Disk" value={`${formatGb(metrics.storageUsedGb)} / ${formatGb(metrics.storageTotalGb)}`} series={slice(metrics.series.disk)} format={(value) => `${value.toFixed(1)}%`} />
              <Metric icon={Network} label="Network" value={`${metrics.networkMbps} Mbps`} series={slice(metrics.series.network)} format={(value) => `${value.toFixed(1)} Mbps`} />
            </div>
          </section>

          <div className="metrics-lower">
            <section className="min-w-0">
              <SectionHeading title="Usage by container" count={containers.length} href="/containers" action="Containers" />
              <div className="panel">
                <div className="usage-row usage-head" aria-hidden><span>Container</span><span>CPU</span><span>Memory</span></div>
                <ul>
                  {containers.length === 0 ? [0, 1, 2, 3].map((row) => (
                    <li key={`ghost-${row}`} className="usage-row usage-ghost" aria-hidden={row > 0}>
                      <span className="min-w-0">{row === 0 ? <><strong className="block text-[13px]">No containers running</strong><small className="text-faint">Usage appears per container once something is deployed.</small></> : <b />}</span>
                      <span className="usage-cell"><span className="usage-bar" /></span>
                      <span className="usage-cell"><span className="usage-bar" /></span>
                    </li>
                  )) : null}
                  {containers.map((container) => (
                    <li key={container.id} className="usage-row" title={`${container.name}: ${container.cpuPercent}% CPU, ${container.memoryMb} MB`}>
                      <span className="min-w-0">
                        <strong>{container.name}</strong>
                        <small>{state.projects.find((project) => project.id === container.projectId)?.name ?? "Infrastructure"} · {container.state}</small>
                      </span>
                      <span className="usage-cell">
                        <span className="usage-bar"><span style={{ width: `${(container.cpuPercent / maxCpu) * 100}%` }} /></span>
                        <span className="usage-value">{container.cpuPercent}%</span>
                      </span>
                      <span className="usage-cell">
                        <span className="usage-bar"><span style={{ width: `${(container.memoryMb / maxMem) * 100}%` }} /></span>
                        <span className="usage-value">{container.memoryMb} MB</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="usage-foot">Containers use {memoryMb >= 1024 ? `${(memoryMb / 1024).toFixed(1)} GB` : `${memoryMb} MB`} of {formatGb(metrics.memoryTotalGb)} memory. Bars are relative to the busiest container.</p>
              </div>
            </section>

            <div className="metrics-side flex min-w-0 flex-col gap-6">
              <section>
                <SectionHeading title="Headroom" />
                <div className="card">
                  <dl className="grid gap-5">
                    {headroom.map((item) => (
                      <div key={item.label} className="resource-stat">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="!mb-0">{item.label}</dt>
                          <dd className="!text-[13px]">{item.pct.toFixed(0)}% used <span className="font-normal text-faint">· {item.free}</span></dd>
                        </div>
                        <SegmentMeter value={item.pct} label={`${item.label} used`} />
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-[11px] text-faint">Bars turn amber at 80% and red at 92%.</p>
                </div>
              </section>
              <section>
                <SectionHeading title="Host" href={`/servers/${server.id}`} action="Open server" />
                <div className="card">
                  <div className="card-head"><IconTile icon={Server} tone="brand" /><div className="min-w-0"><p className="card-title">{server.name}</p><p className="card-sub">{server.os} · {server.arch}</p></div><Tag tone={server.status === "online" ? "success" : "warning"}>{server.status}</Tag></div>
                  <dl className="card-rows">
                    <div><dt>Address</dt><dd className="font-mono text-[11px]">{server.ip} · {server.iface}</dd></div>
                    <div><dt>Network</dt><dd className="font-mono text-[11px]">{server.cidr} via {server.gateway}</dd></div>
                    <div><dt>CPU</dt><dd>{server.cpuCount} cores</dd></div>
                    <div><dt>Docker</dt><dd>{server.dockerVersion} · {server.dockerStatus}</dd></div>
                    <div><dt>Agent</dt><dd>{server.agentVersion} · {server.agentStatus}</dd></div>
                  </dl>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ icon, label, value, series, format }: { icon: LucideIcon; label: string; value: string; series: number[]; format: (value: number) => string }) {
  const stats = summary(series)
  return (
    <section className="card">
      <div className="card-head mb-4">
        <IconTile icon={icon} tone="brand" size="sm" />
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold">{label}</h2>
        <p className="text-[13px] font-medium tabular-nums">{value}</p>
      </div>
      <Sparkline values={series} label={`${label} over the last ${series.length} hours`} format={format} tall />
      <dl className="metric-summary">
        <div><dt>Peak</dt><dd>{format(stats.peak)}</dd></div>
        <div><dt>Average</dt><dd>{format(stats.avg)}</dd></div>
        <div><dt>Low</dt><dd>{format(stats.low)}</dd></div>
      </dl>
    </section>
  )
}
