"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, ItemList, ItemRow, SectionHeading, StatCard, StatGrid } from "@/components/ui/kit"
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
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  const inspect = picked === undefined ? params.get("inspect") : picked
  const [confirm, setConfirm] = useState<{ id: string; action: "stop" | "restart" } | null>(null)

  if (!state) return <PageSkeleton />
  const rows = state.containers.filter((container) => serverId === "all" || container.serverId === serverId)
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
        <div className="page-toolbar">
          <SelectInput aria-label="Server" value={serverId} onChange={(event) => setServerId(event.target.value)}>
            <option value="all">All servers</option>
            {state.servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
          </SelectInput>
          <span className="toolbar-note">Ports show host → container</span>
        </div>
        <div className="mt-3">
          {rows.length === 0 ? <EmptyPanel icon={Boxes} title="No containers" body="Nothing is running on this server yet." /> : (
            <ItemList label="Containers">
              {rows.map((container) => {
                const project = state.projects.find((item) => item.id === container.projectId)
                const port = container.ports.find((item) => item.host)
                return (
                  <ItemRow
                    key={container.id}
                    onClick={() => setPicked(container.id)}
                    icon={container.role === "data" ? Database : container.role === "worker" ? Cog : Box}
                    tone={container.state === "running" ? "success" : container.state === "exited" ? "danger" : container.state === "stopped" ? "warning" : "info"}
                    title={container.name}
                    subtitle={container.image}
                    meta={[
                      <span key="p">{project?.name ?? "Infrastructure"}</span>,
                      <span key="port" className="font-mono text-[11px]">{port ? `${port.host} → ${port.container}` : "internal"}</span>,
                      <span key="up" className="text-faint">{formatUptime(container.startedAt, now)}</span>,
                      <span key="res" className="text-faint">{container.cpuPercent}% · {container.memoryMb} MB</span>,
                    ]}
                    metaWidths={[120, 110, 70, 110]}
                    trailing={<span className="w-[92px]"><ContainerStatusView value={container.state} /></span>}
                  />
                )
              })}
            </ItemList>
          )}
        </div>
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
