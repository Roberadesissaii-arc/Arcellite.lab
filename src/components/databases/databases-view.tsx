"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { copyText, PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { formatRelative } from "@/lib/deploy/format"
import { useNow } from "@/lib/use-now"
import { CirclePlay, Database, HardDrive, KeyRound, Zap } from "lucide-react"
import { Modal } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { useDeployState } from "@/lib/deploy/react"
import type { DatabaseService } from "@/lib/deploy/types"

const ENGINE: Record<DatabaseService["engine"], string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  redis: "Redis",
}

export function DatabasesView() {
  const state = useDeployState()
  const toast = useToast()
  const now = useNow()
  const [id, setId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  if (!state) return <PageSkeleton />
  const selected = state.databases.find((database) => database.id === id) ?? null
  const running = state.databases.filter((database) => database.status === "running").length
  const storage = Math.round(state.databases.reduce((sum, database) => sum + database.storageGb, 0) * 10) / 10
  const engines = new Set(state.databases.map((database) => database.engine)).size
  return (
    <div className="page page-stack">
      <PageHeader icon={Database} kicker="Infrastructure" title="Databases" description="Data services running beside your applications. Credentials stay hidden until you reveal them." />
      <StatGrid>
        <StatCard icon={Database} tone="brand" label="Services" value={state.databases.length} detail={`${engines} engine${engines === 1 ? "" : "s"}`} />
        <StatCard icon={CirclePlay} tone="success" label="Running" value={running} detail={running === state.databases.length ? "All services up" : "Some services stopped"} />
        <StatCard icon={HardDrive} tone="info" label="Storage" value={<>{storage}<small> GB</small></>} detail="Across data volumes" />
        <StatCard icon={KeyRound} tone="neutral" label="Credentials" value={state.databases.filter((database) => database.password).length} detail="Hidden by default" />
      </StatGrid>
      <section>
        <SectionHeading title="Services" count={state.databases.length} />
        {state.databases.length === 0 ? <EmptyPanel icon={Database} title="No databases" body="Data services you add will appear here." /> : (
          <ul className="space-y-4">
            {state.databases.map((database) => {
              const project = state.projects.find((item) => item.id === database.projectId)
              const container = state.containers.find((item) => item.id === database.containerId)
              const server = state.servers.find((item) => item.id === database.serverId)
              const volume = state.volumes.find((item) => item.id === database.volumeId)
              const memoryPct = server && container ? (container.memoryMb / 1024 / server.memoryTotalGb) * 100 : 0
              const diskPct = server ? (database.storageGb / server.storageTotalGb) * 100 : 0
              return (
                <li key={database.id} className="panel">
                  <button type="button" className="item-row" data-interactive onClick={() => { setRevealed(false); setId(database.id) }}>
                    <IconTile icon={database.engine === "redis" ? Zap : Database} tone={database.status === "running" ? "brand" : "warning"} size="lg" />
                    <span className="item-main">
                      <span className="item-title text-[15px]">{database.name}</span>
                      <span className="item-subtitle">{ENGINE[database.engine]} {database.version} · <span className="font-mono">{database.host}:{database.port}</span></span>
                    </span>
                    <span className="item-meta"><Tag>{project?.name ?? "Shared"}</Tag></span>
                    {volume ? <span className="item-meta"><Tag>{volume.name}</Tag></span> : null}
                    <span className="item-trailing"><Tag tone={database.status === "running" ? "success" : "warning"}>{database.status === "running" ? "Running" : "Stopped"}</Tag><KeyRound size={15} className="text-faint" aria-hidden /></span>
                  </button>
                  <div className="border-t border-[var(--border-subtle)] px-[18px] py-5">
                    <dl className="card-grid card-grid-3 !gap-6">
                      <Resource label="CPU" value={container ? `${container.cpuPercent}%` : "—"} meter={container?.cpuPercent ?? 0} />
                      <Resource label="Memory" value={container ? `${container.memoryMb} MB` : "—"} meter={memoryPct} />
                      <Resource label="Data on disk" value={`${database.storageGb} GB`} meter={diskPct} />
                    </dl>
                    <div className="db-connection">
                      <code>{connection(database, false)}</code>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRevealed(false); setId(database.id) }}>Credentials</button>
                    </div>
                    <p className="mt-3 text-[11px] text-faint">
                      {database.database ? `Database ${database.database} · ` : ""}{database.username ? `User ${database.username} · ` : ""}{volume?.lastBackupAt ? `Backup ${formatRelative(volume.lastBackupAt, now)}` : "No backup recorded"}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) { setId(null); setRevealed(false) } }}
        title={selected?.name ?? "Database"}
        description={selected ? `${ENGINE[selected.engine]} ${selected.version}. This is a simulated credential.` : undefined}
      >
        {selected ? (
          <div className="space-y-3 text-sm">
            <p className="font-mono text-[13px] break-all">{connection(selected, revealed)}</p>
            <p className="text-muted">Host {selected.host}:{selected.port}{selected.database ? ` · database ${selected.database}` : ""}{selected.username ? ` · user ${selected.username}` : ""}</p>
            <div className="flex flex-wrap gap-2">
              {selected.password ? (
                <Button type="button" variant="secondary" onClick={() => setRevealed((value) => !value)}>{revealed ? "Hide password" : "Reveal password"}</Button>
              ) : (
                <p className="text-muted">This service has no password in the demo.</p>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const value = selected.password ?? connection(selected, true)
                  void copyText(value).then((ok) => toast(ok ? { title: "Credential copied" } : { title: "Could not copy", tone: "danger" }))
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function connection(database: DatabaseService, reveal: boolean): string {
  if (database.engine === "redis") return `redis://${database.host}:${database.port}`
  const secret = database.password ? (reveal ? database.password : "••••••••") : ""
  const user = database.username ?? ""
  const auth = user ? `${user}:${secret}@` : ""
  const scheme = database.engine === "mysql" ? "mysql" : "postgres"
  return `${scheme}://${auth}${database.host}:${database.port}/${database.database ?? ""}`
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
