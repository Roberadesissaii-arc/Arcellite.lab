"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { copyText, PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
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
          <div className="card-grid">
            {state.databases.map((database) => {
              const project = state.projects.find((item) => item.id === database.projectId)
              return (
                <button key={database.id} type="button" className="card pressable" data-interactive onClick={() => { setRevealed(false); setId(database.id) }}>
                  <span className="card-head">
                    <IconTile icon={database.engine === "redis" ? Zap : Database} tone={database.engine === "redis" ? "danger" : database.engine === "mysql" ? "info" : "brand"} />
                    <span className="min-w-0"><span className="card-title block">{database.name}</span><span className="card-sub block">{ENGINE[database.engine]} {database.version}</span></span>
                    <Tag tone={database.status === "running" ? "success" : "warning"}>{database.status === "running" ? "Running" : "Stopped"}</Tag>
                  </span>
                  <code className="code-chip">{connection(database, false)}</code>
                  <dl className="card-rows">
                    <div><dt>Project</dt><dd>{project?.name ?? "Shared"}</dd></div>
                    <div><dt>Host</dt><dd className="font-mono text-[11px]">{database.host}:{database.port}</dd></div>
                    <div><dt>Storage</dt><dd>{database.storageGb} GB</dd></div>
                  </dl>
                </button>
              )
            })}
          </div>
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
