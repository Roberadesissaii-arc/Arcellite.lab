"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { ArchiveRestore, Database, HardDrive, Layers } from "lucide-react"
import { Modal } from "@/components/ui/overlays"
import { formatGb, formatRelative } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function StorageView() {
  const state = useDeployState()
  const now = useNow()
  const [id, setId] = useState<string | null>(null)
  if (!state) return <PageSkeleton variant="cards" />
  const selected = state.volumes.find((volume) => volume.id === id) ?? null
  const total = Math.round(state.volumes.reduce((sum, volume) => sum + volume.sizeGb, 0) * 10) / 10
  const backedUp = state.volumes.filter((volume) => volume.lastBackupAt).length
  const server = state.servers[0]
  const diskPct = server ? (server.storageUsedGb / server.storageTotalGb) * 100 : 0
  return (
    <div className="page page-stack">
      <PageHeader icon={HardDrive} kicker="Infrastructure" title="Storage" description="Persistent volumes on this server. Phase 1 does not browse files inside them." />
      <StatGrid>
        <StatCard icon={HardDrive} tone="brand" label="Volumes" value={state.volumes.length} detail="Attached to workloads" />
        <StatCard icon={Layers} tone="info" label="Allocated" value={<>{total}<small> GB</small></>} detail="Sum of volume sizes" />
        <StatCard icon={ArchiveRestore} tone={backedUp === state.volumes.length ? "success" : "warning"} label="Backed up" value={`${backedUp}/${state.volumes.length}`} detail={backedUp === state.volumes.length ? "Every volume has a backup" : "Some volumes have no backup"} />
        <StatCard icon={Database} tone="neutral" label="Server disk" value={<>{diskPct.toFixed(0)}<small>%</small></>} detail={server ? `${formatGb(server.storageUsedGb)} of ${formatGb(server.storageTotalGb)}` : "No server"} />
      </StatGrid>
      <section>
        <SectionHeading title="Volumes" count={state.volumes.length} />
        {state.volumes.length === 0 ? <EmptyPanel icon={HardDrive} title="No volumes" body="No volumes are attached." /> : (
          <div className="card-grid card-grid-3">
            {state.volumes.map((volume) => (
              <button key={volume.id} type="button" className="card pressable" data-interactive onClick={() => setId(volume.id)}>
                <span className="card-head">
                  <IconTile icon={HardDrive} tone="brand" />
                  <span className="min-w-0"><span className="card-title block">{volume.name}</span><span className="card-sub block">{volume.attachmentLabel}</span></span>
                  <Tag>{volume.sizeGb} GB</Tag>
                </span>
                <code className="code-chip">{volume.path}</code>
                <span className="mt-3 flex items-center gap-2 text-[11px] text-faint">
                  <ArchiveRestore size={13} aria-hidden />
                  {volume.lastBackupAt ? `Backup ${formatRelative(volume.lastBackupAt, now)}` : "No backup recorded"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
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
