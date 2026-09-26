"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { Modal } from "@/components/ui/overlays"
import { formatRelative } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function StorageView() {
  const state = useDeployState()
  const now = useNow()
  const [id, setId] = useState<string | null>(null)
  if (!state) return <PageSkeleton />
  const selected = state.volumes.find((volume) => volume.id === id) ?? null
  return (
    <div className="page">
      <PageHeader title="Storage" description="Persistent volumes on this server. Phase 1 does not browse files inside them." />
      {state.volumes.length === 0 ? <p className="mt-8 text-sm text-muted">No volumes are attached.</p> : (
        <ul className="panel resource-list mt-6">
          {state.volumes.map((volume) => (
            <li key={volume.id}>
              <button type="button" className="resource-button flex w-full items-baseline justify-between gap-4 px-4 py-4 text-left" onClick={() => setId(volume.id)}>
                <span>
                  <span className="block font-medium">{volume.name}</span>
                  <span className="text-sm text-muted">{volume.sizeGb} GB · {volume.attachmentLabel}</span>
                </span>
                <span className="text-sm text-faint">{volume.lastBackupAt ? `Backup ${formatRelative(volume.lastBackupAt, now)}` : "No backup"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={Boolean(selected)} onOpenChange={(open) => { if (!open) setId(null) }} title={selected?.name ?? "Volume"} description="Infrastructure volume">
        {selected ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Size</dt><dd>{selected.sizeGb} GB</dd>
            <dt className="text-muted">Path</dt><dd className="font-mono text-[13px]">{selected.path}</dd>
            <dt className="text-muted">Attached</dt><dd>{selected.attachmentLabel}</dd>
            <dt className="text-muted">Created</dt><dd>{formatRelative(selected.createdAt, now)}</dd>
            <dt className="text-muted">Last backup</dt><dd>{selected.lastBackupAt ? formatRelative(selected.lastBackupAt, now) : "None recorded"}</dd>
          </dl>
        ) : null}
      </Modal>
    </div>
  )
}
