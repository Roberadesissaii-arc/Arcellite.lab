"use client"

import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Meter, PageSkeleton } from "@/components/ui/bits"
import { ServerStatusView } from "@/components/ui/status"
import { formatGb, formatPercent, formatUptime, plural } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function ServersView() {
  const state = useDeployState()
  const now = useNow()
  if (!state) return <PageSkeleton />
  return (
    <div className="page">
      <PageHeader title="Servers" description="Machines this control plane can place work on." />
      <ul className="mt-6 space-y-4">
        {state.servers.map((server) => {
          const containers = state.containers.filter((item) => item.serverId === server.id)
          const projects = new Set(containers.map((item) => item.projectId).filter(Boolean))
          return (
            <li key={server.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link href={`/servers/${server.id}`} className="text-lg font-medium hover:underline">
                    {server.name}
                  </Link>
                  <div className="mt-2"><ServerStatusView value={server.status} /></div>
                  <p className="mt-3 text-sm text-muted">{server.os}<br />{server.arch}<br />{server.ip}</p>
                </div>
                <p className="text-sm text-muted">
                  {plural(containers.length, "container")} · {plural(projects.size, "project")}<br />
                  Uptime {formatUptime(server.startedAt, now)}
                </p>
              </div>
              {server.status === "offline" ? (
                <p className="mt-4 text-sm text-muted">This server is not reporting. Open it to reconnect.</p>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <Stat label="CPU" value={formatPercent(server.cpuPercent)} meter={server.cpuPercent} />
                  <Stat label="Memory" value={`${formatGb(server.memoryUsedGb)} / ${formatGb(server.memoryTotalGb)}`} meter={(server.memoryUsedGb / server.memoryTotalGb) * 100} />
                  <Stat label="Storage" value={`${formatGb(server.storageUsedGb)} / ${formatGb(server.storageTotalGb)}`} meter={(server.storageUsedGb / server.storageTotalGb) * 100} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Stat({ label, value, meter }: { label: string; value: string; meter: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="text-muted">{label}</span><span className="tabular-nums">{value}</span></div>
      <Meter value={meter} label={label} />
    </div>
  )
}
