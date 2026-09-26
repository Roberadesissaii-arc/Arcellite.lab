"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, SearchField, SectionHeading, StatCard, StatGrid } from "@/components/ui/kit"
import { SelectInput } from "@/components/ui/fields"
import { Modal, ConfirmDialog } from "@/components/ui/overlays"
import { ContainerStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { formatUptime, plural } from "@/lib/deploy/format"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { DeployError, type Container } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"
import Link from "next/link"
import { Box, Boxes, CirclePlay, Cog, Cpu, Database, MemoryStick } from "lucide-react"

export function ContainersView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow()
  const params = useSearchParams()
  const [serverId, setServerId] = useState("all")
  const [search, setSearch] = useState("")
  const [stateFilter, setStateFilter] = useState("all")
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  const inspect = picked === undefined ? params.get("inspect") : picked
  const [confirm, setConfirm] = useState<{ id: string; action: "stop" | "restart" } | null>(null)

  if (!state) return <PageSkeleton variant="table" />
  const q = search.trim().toLowerCase()
  const rows = state.containers.filter((container) => {
    const project = state.projects.find((item) => item.id === container.projectId)
    return (serverId === "all" || container.serverId === serverId)
      && (stateFilter === "all" || container.state === stateFilter)
      && (!q || [container.name, container.image, project?.name ?? ""].some((text) => text.toLowerCase().includes(q)))
  })
  const maxCpu = Math.max(1, ...state.containers.map((container) => container.cpuPercent))
  const maxMem = Math.max(1, ...state.containers.map((container) => container.memoryMb))
  const selected = state.containers.find((container) => container.id === inspect) ?? null

  async function act(container: Container, action: "start" | "stop" | "restart") {
    try {
      await deploy.containerAction(container.id, action)
      toast({
        title: action === "restart" ? "Restart requested" : action === "stop" ? "Container stopped" : "Container starting",
        description: container.name,
      })
    } catch (error) {
      if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
    }
  }

  const running = state.containers.filter((container) => container.state === "running").length
  const idle = state.containers.length - running
  const cpu = rows.reduce((sum, container) => sum + container.cpuPercent, 0)
  const memory = rows.reduce((sum, container) => sum + container.memoryMb, 0)

  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={Boxes} kicker="Infrastructure" title="Containers" description="Workloads the control plane knows about. Select a container to inspect, stop, or restart it." />
      <StatGrid>
        <StatCard icon={Boxes} tone="brand" label="Containers" value={state.containers.length} detail={`Across ${plural(state.servers.length, "server")}`} />
        <StatCard icon={CirclePlay} tone="success" label="Running" value={running} detail={idle ? `${idle} stopped or exited` : "Everything is up"} />
        <StatCard icon={Cpu} tone="info" label="CPU in use" value={<>{cpu.toFixed(1)}<small>%</small></>} detail="Sum of shown containers" />
        <StatCard icon={MemoryStick} tone="neutral" label="Memory in use" value={<>{memory >= 1024 ? (memory / 1024).toFixed(1) : memory}<small>{memory >= 1024 ? " GB" : " MB"}</small></>} detail="Resident set size" />
      </StatGrid>
      <section>
        <SectionHeading title="Workloads" count={rows.length} />
        <div className="page-toolbar mb-3">
          <SearchField value={search} onChange={setSearch} placeholder="Search name, image, or project" label="Search containers" />
          <SelectInput aria-label="State" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value="all">All states</option>
            <option value="running">Running</option>
            <option value="starting">Starting</option>
            <option value="restarting">Restarting</option>
            <option value="stopped">Stopped</option>
            <option value="exited">Exited</option>
          </SelectInput>
          <SelectInput aria-label="Server" value={serverId} onChange={(event) => setServerId(event.target.value)}>
            <option value="all">All servers</option>
            {state.servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
          </SelectInput>
        </div>
        {rows.length === 0 ? <EmptyPanel icon={Boxes} title="No containers match" body="Try another state, server, or search." /> : (
          <div className="panel data-table-wrap">
            <div className="data-table-scroll">
              <table className="data-table container-table">
                <colgroup>
                  <col className="c-name" /><col className="c-project" /><col className="c-state" /><col className="c-ports" /><col className="c-uptime" /><col className="c-cpu" /><col className="c-mem" />
                </colgroup>
                <thead>
                  <tr><th>Container</th><th className="c-project">Project</th><th>State</th><th className="c-ports">Ports</th><th className="c-uptime">Uptime</th><th className="c-cpu">CPU</th><th className="c-mem">Memory</th></tr>
                </thead>
                <tbody>
                  {rows.map((container) => {
                    const project = state.projects.find((item) => item.id === container.projectId)
                    const ports = container.ports.filter((item) => item.host)
                    return (
                      <tr key={container.id} tabIndex={0} onClick={() => setPicked(container.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPicked(container.id) } }}>
                        <td>
                          <span className="table-identity">
                            <IconTile icon={container.role === "data" ? Database : container.role === "worker" ? Cog : Box} tone={container.state === "running" ? "brand" : container.state === "exited" ? "danger" : container.state === "stopped" ? "warning" : "info"} />
                            <span className="min-w-0"><strong>{container.name}</strong><small>{container.image}</small></span>
                          </span>
                        </td>
                        <td className="c-project text-muted">{project?.name ?? "Infrastructure"}</td>
                        <td><ContainerStatusView value={container.state} /></td>
                        <td className="c-ports">{ports.length ? ports.map((port) => <code key={port.container} className="table-code mr-1">{port.host} → {port.container}</code>) : <span className="text-faint">internal</span>}</td>
                        <td className="c-uptime text-muted tabular-nums">{formatUptime(container.startedAt, now)}</td>
                        <td className="c-cpu"><span className="usage-cell"><span className="usage-bar"><span style={{ width: `${Math.min(100, (container.cpuPercent / maxCpu) * 100)}%` }} /></span><span className="usage-value !w-[44px]">{container.cpuPercent}%</span></span></td>
                        <td className="c-mem"><span className="usage-cell"><span className="usage-bar"><span style={{ width: `${Math.min(100, (container.memoryMb / maxMem) * 100)}%` }} /></span><span className="usage-value !w-[56px]">{container.memoryMb} MB</span></span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="data-table-footer"><p>Showing <strong>{rows.length}</strong> of <strong>{state.containers.length}</strong> containers</p><span className="text-faint">Bars are relative to the busiest container. Select a row to inspect it.</span></div>
          </div>
        )}
      </section>
      <Modal open={Boolean(selected)} onOpenChange={(open) => { if (!open) setPicked(null) }} title={selected?.name ?? "Container"} description={selected?.image}>
        {selected ? (
          <div className="space-y-3 text-sm">
            <p><span className="text-muted">State</span> · {selected.state}</p>
            <p><span className="text-muted">Command</span> · <span className="font-mono text-[13px]">{selected.command}</span></p>
            <p><span className="text-muted">Restart</span> · {selected.restartPolicy}</p>
            <p><span className="text-muted">Ports</span> · {selected.ports.length ? selected.ports.map((port) => `${port.host ?? "internal"}:${port.container}/${port.protocol}`).join(", ") : "none published"}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link className="btn btn-secondary" href={`/logs`}>Open logs</Link>
              {selected.state === "running" || selected.state === "starting" || selected.state === "restarting" ? (
                <Button variant="danger" onClick={() => setConfirm({ id: selected.id, action: "stop" })}>Stop</Button>
              ) : (
                <Button variant="primary" onClick={() => void act(selected, "start")}>Start</Button>
              )}
              <Button variant="secondary" onClick={() => setConfirm({ id: selected.id, action: "restart" })}>Restart</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.action === "stop" ? "Stop this container?" : "Restart this container?"}
        body={confirm?.action === "stop" ? "The published endpoint will stop responding until the container is started again." : "The container will be restarted by the mock runtime."}
        confirmLabel={confirm?.action === "stop" ? "Stop container" : "Restart"}
        danger={confirm?.action === "stop"}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        onConfirm={() => {
          const container = state.containers.find((item) => item.id === confirm?.id)
          const action = confirm?.action
          setConfirm(null)
          if (container && action) void act(container, action)
        }}
      />
    </div>
  )
}
