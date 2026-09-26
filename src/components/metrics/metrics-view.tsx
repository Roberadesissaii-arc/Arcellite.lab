"use client"

import { useState } from "react"
import { Boxes, Cpu, Gauge, HardDrive, MemoryStick, Network, type LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton, Sparkline } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { EmptyPanel, IconTile, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { formatGb, formatPercent } from "@/lib/deploy/format"
import { serverMetrics } from "@/lib/deploy/helpers"
import { useDeployState } from "@/lib/deploy/react"

export function MetricsView() {
  const state = useDeployState()
  const [serverId, setServerId] = useState(state?.servers[0]?.id ?? "")
  if (!state) return <PageSkeleton />
  const server = state.servers.find((item) => item.id === (serverId || state.servers[0]?.id)) ?? state.servers[0]
  if (!server) return <div className="page"><EmptyPanel icon={Gauge} title="No server to measure" body="Connect a server to see telemetry." /></div>
  const metrics = serverMetrics(server, state)
  return (
    <div className="page page-stack">
      <PageHeader
        icon={Gauge}
        kicker="Observe"
        title="Metrics"
        description="Recent samples from the selected server. The series is deterministic demo telemetry."
        actions={state.servers.length > 1 ? (
          <SelectInput aria-label="Server" value={server.id} onChange={(event) => setServerId(event.target.value)} className="min-w-[200px]">
            {state.servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </SelectInput>
        ) : <Tag tone="brand">{server.name}</Tag>}
      />
      {!metrics.available ? (
        <EmptyPanel icon={Gauge} title="Telemetry paused" body={`${metrics.reason} Reconnect the server to see telemetry again.`} />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={Cpu} tone="brand" label="CPU" value={<>{metrics.cpu.toFixed(0)}<small>%</small></>} detail={`${server.cpuCount} cores`} />
            <StatCard icon={MemoryStick} tone="info" label="Memory" value={formatGb(metrics.memoryUsedGb)} detail={`of ${formatGb(metrics.memoryTotalGb)}`} />
            <StatCard icon={Boxes} tone="success" label="Running containers" value={metrics.runningContainers} href="/containers" detail={`${metrics.deploymentCount} ready deployments`} />
            <StatCard icon={Network} tone="neutral" label="Network" value={<>{metrics.networkMbps}<small> Mbps</small></>} detail="Current throughput" />
          </StatGrid>
          <section>
            <SectionHeading title="Last 24 hours" />
            <div className="card-grid">
              <Metric icon={Cpu} label="CPU" value={formatPercent(metrics.cpu)} series={metrics.series.cpu} format={formatPercent} />
              <Metric icon={MemoryStick} label="Memory" value={`${formatGb(metrics.memoryUsedGb)} / ${formatGb(metrics.memoryTotalGb)}`} series={metrics.series.memory} format={(value) => `${value.toFixed(1)}%`} />
              <Metric icon={HardDrive} label="Disk" value={`${formatGb(metrics.storageUsedGb)} / ${formatGb(metrics.storageTotalGb)}`} series={metrics.series.disk} format={(value) => `${value.toFixed(1)}%`} />
              <Metric icon={Network} label="Network" value={`${metrics.networkMbps} Mbps`} series={metrics.series.network} format={(value) => `${value.toFixed(1)} Mbps`} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Metric({ icon, label, value, series, format }: { icon: LucideIcon; label: string; value: string; series: number[]; format: (value: number) => string }) {
  return (
    <section className="card">
      <div className="card-head mb-4">
        <IconTile icon={icon} tone="brand" size="sm" />
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold">{label}</h2>
        <p className="text-[13px] font-medium tabular-nums">{value}</p>
      </div>
      <Sparkline values={series} label={`${label} over recent hours`} format={format} tall />
    </section>
  )
}
