"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { copyText, PageSkeleton } from "@/components/ui/bits"
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
  return (
    <div className="page">
      <PageHeader title="Databases" description="Data services running beside your applications. Credentials stay hidden until you reveal them." />
      <ul className="panel resource-list mt-6">
        {state.databases.map((database) => (
          <li key={database.id}>
            <button type="button" className="resource-button database-row w-full px-4 py-4 text-left" onClick={() => { setRevealed(false); setId(database.id) }}>
              <span className="block font-medium">{database.name}</span>
              <span className="text-sm text-muted">{ENGINE[database.engine]} {database.version}</span>
              <span className="mt-1 block text-sm">{database.status === "running" ? "Running" : "Stopped"}</span>
              <span className="mt-2 block font-mono text-sm text-muted">{connection(database, false)}</span>
              <span className="mt-1 block text-sm text-faint">{database.storageGb} GB</span>
            </button>
          </li>
        ))}
      </ul>
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
