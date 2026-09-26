"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton, Sparkline } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { formatGb, formatPercent, plural } from "@/lib/deploy/format"
import { serverMetrics } from "@/lib/deploy/helpers"
import { useDeployState } from "@/lib/deploy/react"

export function MetricsView() {
  const state = useDeployState()
  const [serverId, setServerId] = useState(state?.servers[0]?.id ?? "")
  if (!state) return <PageSkeleton />
  const server = state.servers.find((item) => item.id === (serverId || state.servers[0]?.id)) ?? state.servers[0]
  if (!server) return <div className="page"><p>No server to measure.</p></div>
  const metrics = serverMetrics(server, state)
  return (
    <div className="page">
      <PageHeader title="Metrics" description="Recent samples from the selected server. The series is deterministic demo telemetry." />
      <div className="mt-6 max-w-xs">
        <SelectInput aria-label="Server" value={server.id} onChange={(event) => setServerId(event.target.value)}>
          {state.servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectInput>
      </div>
      {!metrics.available ? (
        <p className="mt-8 max-w-lg text-sm">{metrics.reason} Reconnect the server to see telemetry again.</p>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Metric label="CPU" value={formatPercent(metrics.cpu)} series={metrics.series.cpu} format={formatPercent} />
          <Metric label="Memory" value={`${formatGb(metrics.memoryUsedGb)} / ${formatGb(metrics.memoryTotalGb)}`} series={metrics.series.memory} format={(value) => `${value.toFixed(1)}%`} />
          <Metric label="Disk" value={`${formatGb(metrics.storageUsedGb)} / ${formatGb(metrics.storageTotalGb)}`} series={metrics.series.disk} format={(value) => `${value.toFixed(1)}%`} />
          <Metric label="Network" value={`${metrics.networkMbps} Mbps`} series={metrics.series.network} format={(value) => `${value.toFixed(1)} Mbps`} />
          <p className="text-sm text-muted">
            {plural(metrics.runningContainers, "container")} running · {plural(metrics.deploymentCount, "ready deployment")}
          </p>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, series, format }: { label: string; value: string; series: number[]; format: (value: number) => string }) {
  return (
    <section className="panel p-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">{label}</h2>
        <p className="tabular-nums">{value}</p>
      </div>
      <Sparkline values={series} label={`${label} over recent hours`} format={format} />
    </section>
  )
}
