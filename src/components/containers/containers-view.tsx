"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { Modal, ConfirmDialog } from "@/components/ui/overlays"
import { ContainerStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { formatUptime } from "@/lib/deploy/format"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { DeployError, type Container } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"
import Link from "next/link"

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

  return (
    <div className="page page-wide">
      <PageHeader title="Containers" description="Workloads currently known to the control plane." />
      <div className="mt-6 max-w-xs">
        <SelectInput aria-label="Server" value={serverId} onChange={(event) => setServerId(event.target.value)}>
          <option value="all">All servers</option>
          {state.servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
        </SelectInput>
      </div>
      {rows.length === 0 ? <p className="mt-8 text-sm text-muted">No containers on this server.</p> : (
        <ul className="panel resource-list mt-4">
            <li className="list-columns container-table-row" aria-hidden="true"><span>Container</span><span>Project</span><span>Image</span><span>State</span><span>Uptime</span><span>Ports</span><span>CPU / RAM</span></li>
          {rows.map((container) => {
            const project = state.projects.find((item) => item.id === container.projectId)
            const port = container.ports.find((item) => item.host)
            return (
              <li key={container.id} className="data-row container-table-row">
                <button type="button" className="text-left font-medium" onClick={() => setPicked(container.id)}>{container.name}</button>
                <span className="text-sm text-muted">{project?.name ?? "Infrastructure"}</span>
                <span className="truncate text-sm text-muted">{container.image}</span>
                <ContainerStatusView value={container.state} />
                <span className="text-sm tabular-nums text-muted">{formatUptime(container.startedAt, now)}</span>
                <span className="text-sm text-muted">{port ? `${port.host}:${port.container}` : "internal"}</span>
                <span className="text-sm tabular-nums text-muted">{container.cpuPercent}% · {container.memoryMb} MB</span>
              </li>
            )
          })}
        </ul>
      )}
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
