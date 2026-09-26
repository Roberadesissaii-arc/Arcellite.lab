"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { PageSkeleton } from "@/components/ui/bits"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/overlays"
import { ServerStatusView, ContainerStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { Sparkline } from "@/components/ui/bits"
import { formatGb, formatPercent, formatRelative, formatUptime } from "@/lib/deploy/format"
import { serverMetrics } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { DeployError } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

const TABS = ["Overview", "Containers", "Storage", "Network", "Activity", "Settings"] as const

export function ServerDetail() {
  const params = useParams<{ serverId: string }>()
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview")
  const [confirm, setConfirm] = useState<"restart" | "disconnect" | null>(null)
  const server = state?.servers.find((item) => item.id === params.serverId)
  if (!state) return <PageSkeleton variant="detail" />
  if (!server) {
    return <div className="page"><h1 className="page-title">Server not found</h1></div>
  }
  const metrics = serverMetrics(server, state)
  const containers = state.containers.filter((item) => item.serverId === server.id)
  const volumes = state.volumes.filter((item) => item.serverId === server.id)
  const activity = state.activity.filter((item) => item.objectName === server.name || item.href?.includes(server.id))

  async function run(action: "refresh" | "restart" | "disconnect" | "reconnect") {
    try {
      if (action === "refresh") {
        await deploy.refreshServer(server!.id)
        toast({ title: "Status refreshed" })
      } else if (action === "restart") {
        await deploy.restartAgent(server!.id)
        toast({ title: "Agent restart requested", description: "Phase 1 records the request. No real agent is running." })
      } else if (action === "disconnect") {
        await deploy.disconnectServer(server!.id)
        toast({ title: "Server disconnected" })
      } else {
        await deploy.reconnectServer(server!.id)
        toast({ title: "Server connected" })
      }
    } catch (error) {
      if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
    }
  }

  return (
    <div className="page page-wide">
      <p className="page-kicker">Server</p>
      <div className="page-introduction mt-2">
        <div>
          <h1 className="page-title">{server.name}</h1>
          <div className="mt-2"><ServerStatusView value={server.status} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void run("refresh")}>Refresh status</Button>
          <Link className="btn btn-ghost" href="/containers">View containers</Link>
          <Link className="btn btn-ghost" href={`/logs`}>View logs</Link>
          <Button variant="ghost" onClick={() => setConfirm("restart")}>Restart agent</Button>
          {server.status === "offline" ? (
            <Button variant="primary" onClick={() => void run("reconnect")}>Reconnect server</Button>
          ) : (
            <Button variant="danger" onClick={() => setConfirm("disconnect")}>Disconnect</Button>
          )}
        </div>
      </div>
      {server.status === "offline" ? (
        <p className="mt-4 max-w-xl text-sm">
          {server.name} stopped accepting heartbeats. Deployments and container actions are paused. Reconnect to resume the mock agent.
        </p>
      ) : null}
      <div className="mt-6 flex gap-1 overflow-auto border-b border-[var(--border-subtle)]">
        {TABS.map((item) => (
          <button key={item} type="button" className="border-b-2 px-3 py-2 text-sm" style={{ borderColor: tab === item ? "var(--brand-primary)" : "transparent", fontWeight: tab === item ? 600 : 500 }} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="pt-6">
        {tab === "Overview" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Hostname</dt><dd>{server.name}</dd>
              <dt className="text-muted">Address</dt><dd>{server.ip}</dd>
              <dt className="text-muted">System</dt><dd>{server.os}</dd>
              <dt className="text-muted">Architecture</dt><dd>{server.arch}</dd>
              <dt className="text-muted">CPU</dt><dd>{server.cpuCount} cores · {server.status === "offline" ? "unavailable" : formatPercent(server.cpuPercent)}</dd>
              <dt className="text-muted">Memory</dt><dd>{formatGb(server.memoryUsedGb)} / {formatGb(server.memoryTotalGb)}</dd>
              <dt className="text-muted">Disk</dt><dd>{formatGb(server.storageUsedGb)} / {formatGb(server.storageTotalGb)}</dd>
              <dt className="text-muted">Uptime</dt><dd>{formatUptime(server.startedAt, now)}</dd>
              <dt className="text-muted">Docker</dt><dd>{server.dockerStatus === "running" ? `Engine ${server.dockerVersion}` : "Unavailable"}</dd>
              <dt className="text-muted">Agent</dt><dd>{server.agentVersion} · {server.agentStatus}</dd>
            </dl>
            {metrics.available ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-sm text-muted">CPU · {formatPercent(metrics.cpu)}</p>
                  <Sparkline values={metrics.series.cpu} label="CPU history" format={(value) => formatPercent(value)} />
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted">Memory · {formatGb(metrics.memoryUsedGb)}</p>
                  <Sparkline values={metrics.series.memory} label="Memory history" format={(value) => `${value.toFixed(1)}%`} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{metrics.reason}</p>
            )}
          </div>
        ) : null}
        {tab === "Containers" ? (
          <ul>
            {containers.map((container) => (
              <li key={container.id} className="data-row md:grid-cols-[1fr_140px_1fr]">
                <Link href={`/containers?inspect=${container.id}`} className="font-medium">{container.name}</Link>
                <ContainerStatusView value={container.state} />
                <span className="truncate text-sm text-muted">{container.image}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "Storage" ? (
          <ul>
            {volumes.map((volume) => (
              <li key={volume.id} className="flex justify-between border-b border-[var(--border-subtle)] py-3 text-sm">
                <span>{volume.name}<span className="block text-muted">{volume.attachmentLabel}</span></span>
                <span className="tabular-nums">{volume.sizeGb} GB</span>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "Network" ? (
          <dl className="grid max-w-lg grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Interface</dt><dd>{server.iface}</dd>
            <dt className="text-muted">CIDR</dt><dd>{server.cidr}</dd>
            <dt className="text-muted">Gateway</dt><dd>{server.gateway}</dd>
            <dt className="text-muted">DNS</dt><dd>{server.dns.join(", ")}</dd>
            <dt className="text-muted">Throughput</dt><dd>{server.status === "offline" ? "Unavailable" : `${server.networkMbps} Mbps`}</dd>
          </dl>
        ) : null}
        {tab === "Activity" ? (
          <ul>
            {activity.length === 0 ? <li className="text-sm text-muted">No server events yet.</li> : activity.map((event) => (
              <li key={event.id} className="border-b border-[var(--border-subtle)] py-3 text-sm">
                <span className="font-medium">{event.action}</span>
                <span className="text-muted"> · {formatRelative(event.timestamp, now)}</span>
                {event.detail ? <span className="block text-muted">{event.detail}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "Settings" ? (
          <div className="max-w-lg text-sm">
            <p>Docker Engine {server.dockerVersion} is {server.dockerStatus}.</p>
            <p className="mt-2 text-muted">The Phase 1 agent ({server.agentVersion}) is simulated. Restart and disconnect update this control plane only.</p>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm != null}
        title={confirm === "disconnect" ? `Disconnect ${server.name}?` : "Restart the agent?"}
        body={confirm === "disconnect" ? "The control plane will treat this server as offline until you reconnect it." : "Phase 1 records an agent restart. No process on the machine is touched."}
        confirmLabel={confirm === "disconnect" ? "Disconnect" : "Restart agent"}
        danger={confirm === "disconnect"}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        onConfirm={() => {
          const action = confirm
          setConfirm(null)
          if (action === "disconnect") void run("disconnect")
          if (action === "restart") void run("restart")
        }}
      />
    </div>
  )
}
