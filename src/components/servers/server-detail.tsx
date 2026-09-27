"use client"

import { Box, Boxes, Clock, Cpu, Gauge, HardDrive, History, LayoutDashboard, MemoryStick, Monitor, Network, Server as ServerIcon, Settings, Unplug } from "lucide-react"
import { motion } from "motion/react"
import { ActivityTimeline } from "@/components/activity/timeline"
import { EmptyPanel, IconTile, SegmentMeter, StatCard, StatGrid } from "@/components/ui/kit"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { PageSkeleton } from "@/components/ui/bits"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/overlays"
import { ServerStatusView, ContainerStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { Sparkline } from "@/components/ui/bits"
import { formatGb, formatPercent, formatUptime } from "@/lib/deploy/format"
import { useDeploy, useDeployState, useServerMetrics } from "@/lib/deploy/react"
import { DeployError } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

const TABS = ["Overview", "Containers", "Storage", "Network", "Activity", "Settings"] as const
const TAB_ICONS = { Overview: LayoutDashboard, Containers: Boxes, Storage: HardDrive, Network, Activity: History, Settings } as const

export function ServerDetail() {
  const params = useParams<{ serverId: string }>()
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview")
  const [confirm, setConfirm] = useState<"restart" | "disconnect" | null>(null)
  const server = state?.servers.find((item) => item.id === params.serverId)
  const metrics = useServerMetrics(server?.id)
  if (!state) return <PageSkeleton variant="detail" />
  if (!server || !metrics) {
    return <div className="page"><h1 className="page-title">Server not found</h1></div>
  }
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
    <div className="page page-wide page-stack">
      <header className="page-introduction">
        <div className="page-introduction-main">
          <span className="page-introduction-icon"><ServerIcon aria-hidden /></span>
          <div className="min-w-0">
            <p className="page-kicker">Server</p>
            <h1 className="page-title mt-1 font-heading">{server.name}<span className="text-brand">.</span></h1>
            <p className="page-copy mt-2">{server.os} · {server.arch} · {server.ip}</p>
            <div className="project-hero-meta"><ServerStatusView value={server.status} /></div>
          </div>
        </div>
        <div className="page-introduction-actions">
          <Button variant="primary" onClick={() => void run("refresh")}>Refresh status</Button>
        </div>
      </header>
      <div className="intro-toolbar">
        <Link className="btn btn-secondary btn-sm" href="/containers">View containers</Link>
        <Link className="btn btn-secondary btn-sm" href={`/logs`}>View logs</Link>
        <Button variant="ghost" size="sm" onClick={() => setConfirm("restart")}>Restart agent</Button>
        <span className="flex-1" />
        {server.status === "offline" ? (
          <Button variant="primary" size="sm" onClick={() => void run("reconnect")}>Reconnect server</Button>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirm("disconnect")}>Disconnect</Button>
        )}
      </div>
      {server.status === "offline" ? (
        <p className="sd-offline"><Unplug aria-hidden />{server.name} stopped accepting heartbeats. Deployments and container actions are paused until it reconnects.</p>
      ) : null}

      <StatGrid>
        <StatCard icon={Cpu} tone="brand" label="CPU" value={server.status === "offline" ? "—" : <>{server.cpuPercent}<small>%</small></>} detail={`${server.cpuCount} cores`} />
        <StatCard icon={MemoryStick} tone="info" label="Memory" value={formatGb(server.memoryUsedGb)} detail={`of ${formatGb(server.memoryTotalGb)}`} />
        <StatCard icon={HardDrive} tone="neutral" label="Disk" value={formatGb(server.storageUsedGb)} detail={`of ${formatGb(server.storageTotalGb)}`} />
        <StatCard icon={Clock} tone="success" label="Uptime" value={formatUptime(server.startedAt, now)} detail={`Agent ${server.agentStatus}`} />
      </StatGrid>

      <nav className="project-tabs" aria-label="Server sections">
        {TABS.map((item) => {
          const Icon = TAB_ICONS[item]
          return (
            <button key={item} type="button" className="project-tab" aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)}>
              {tab === item ? <motion.span layoutId="server-tab-pill" className="project-tab-pill" transition={{ type: "spring", bounce: 0, duration: 0.36 }} /> : null}
              <span className="project-tab-label"><Icon aria-hidden />{item}</span>
            </button>
          )
        })}
      </nav>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.34 }}>
        {tab === "Overview" ? (
          <div className="sd-overview">
            <section className="panel sd-facts">
              <p className="sd-card-title"><Monitor aria-hidden />Machine</p>
              <dl>
                <div><dt>Hostname</dt><dd>{server.name}</dd></div>
                <div><dt>Address</dt><dd><code>{server.ip}</code></dd></div>
                <div><dt>System</dt><dd>{server.os}</dd></div>
                <div><dt>Architecture</dt><dd><code>{server.arch}</code></dd></div>
                <div><dt>CPU</dt><dd>{server.cpuCount} cores</dd></div>
                <div><dt>Docker</dt><dd>{server.dockerStatus === "running" ? `Engine ${server.dockerVersion}` : "Unavailable"}</dd></div>
                <div><dt>Agent</dt><dd>{server.agentVersion} · {server.agentStatus}</dd></div>
                <div><dt>Containers</dt><dd>{containers.length} on this server</dd></div>
              </dl>
            </section>
            <div className="sd-charts">
              {metrics.available ? (
                <>
                  <section className="panel sd-chart">
                    <p className="sd-card-title"><Cpu aria-hidden />CPU<span>{formatPercent(metrics.cpu)}</span></p>
                    <Sparkline values={metrics.series.cpu} label="CPU history" format={(value) => formatPercent(value)} />
                  </section>
                  <section className="panel sd-chart">
                    <p className="sd-card-title"><MemoryStick aria-hidden />Memory<span>{formatGb(metrics.memoryUsedGb)} / {formatGb(metrics.memoryTotalGb)}</span></p>
                    <Sparkline values={metrics.series.memory} label="Memory history" format={(value) => `${value.toFixed(1)}%`} />
                  </section>
                </>
              ) : (
                <section className="panel sd-empty"><Gauge aria-hidden /><strong>No live metrics</strong><small>{metrics.reason}</small></section>
              )}
            </div>
          </div>
        ) : null}

        {tab === "Containers" ? (
          containers.length ? (
            <ul className="workload-grid">
              {containers.map((container) => (
                <li key={container.id}>
                  <Link href={`/containers?inspect=${container.id}`} className="workload-card">
                    <span className="workload-head">
                      <IconTile icon={Box} tone={container.state === "running" ? "brand" : "danger"} />
                      <span className="min-w-0 flex-1"><strong>{container.name}</strong><small>{container.role}</small></span>
                      <ContainerStatusView value={container.state} />
                    </span>
                    <code className="workload-image">{container.image}</code>
                    <span className="workload-meters">
                      <span><small>CPU</small><b>{container.cpuPercent}%</b><SegmentMeter value={container.cpuPercent * 4} label="CPU" /></span>
                      <span><small>Memory</small><b>{container.memoryMb} MB</b><SegmentMeter value={(container.memoryMb / 1024) * 100} label="Memory" /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyPanel icon={Boxes} title="No containers yet" body="Containers appear here when you deploy a project to this server." />
        ) : null}

        {tab === "Storage" ? (
          volumes.length ? (
            <ul className="panel sd-list">
              {volumes.map((volume) => (
                <li key={volume.id}>
                  <IconTile icon={HardDrive} tone="brand" />
                  <span className="min-w-0 flex-1"><strong>{volume.name}</strong><small>{volume.attachmentLabel} · <code>{volume.path}</code></small></span>
                  <span className="sd-list-value">{volume.sizeGb} GB</span>
                </li>
              ))}
            </ul>
          ) : <EmptyPanel icon={HardDrive} title="No volumes yet" body="Databases and apps that keep data create volumes here." />
        ) : null}

        {tab === "Network" ? (
          <section className="panel sd-facts sd-network">
            <p className="sd-card-title"><Network aria-hidden />Network</p>
            <dl>
              <div><dt>Interface</dt><dd><code>{server.iface}</code></dd></div>
              <div><dt>Address</dt><dd><code>{server.ip}</code></dd></div>
              <div><dt>Subnet</dt><dd><code>{server.cidr}</code></dd></div>
              <div><dt>Gateway</dt><dd><code>{server.gateway}</code></dd></div>
              <div><dt>DNS</dt><dd><code>{server.dns.join(", ")}</code></dd></div>
              <div><dt>Throughput</dt><dd>{server.status === "offline" ? "Unavailable" : `${server.networkMbps} Mbps`}</dd></div>
            </dl>
          </section>
        ) : null}

        {tab === "Activity" ? (
          activity.length ? <ActivityTimeline events={activity} now={now} pageSize={8} /> : <EmptyPanel icon={History} title="No server events yet" body="Connections, restarts, and agent changes will be listed here." />
        ) : null}

        {tab === "Settings" ? (
          <section className="setting-group">
            <h3>Agent</h3>
            <div className="setting-rows">
              <div className="setting-row"><div><p className="setting-label">Docker Engine</p><p className="setting-hint">Runs every container on this server.</p></div><div className="setting-control"><span className="setting-value">{server.dockerVersion} · {server.dockerStatus}</span></div></div>
              <div className="setting-row"><div><p className="setting-label">Agent version</p><p className="setting-hint">Phase 1 simulates the agent. Restart and disconnect update this control plane only.</p></div><div className="setting-control"><code className="table-code">{server.agentVersion}</code></div></div>
              <div className="setting-row"><div><p className="setting-label">Restart agent</p><p className="setting-hint">Reconnects the agent process.</p></div><div className="setting-control"><Button variant="secondary" size="sm" onClick={() => setConfirm("restart")}>Restart agent</Button></div></div>
            </div>
          </section>
        ) : null}
      </motion.div>
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
