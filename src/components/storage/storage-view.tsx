"use client"

import Link from "next/link"
import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, SearchField, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag, type Tone } from "@/components/ui/kit"
import { SelectInput } from "@/components/ui/fields"
import { ArchiveRestore, Database, FolderOpen, HardDrive, Layers, SearchX, Zap, type LucideIcon } from "lucide-react"
import { Modal } from "@/components/ui/overlays"
import { formatGb, formatRelative } from "@/lib/deploy/format"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

type Kind = "database" | "cache" | "app"

const KINDS: { id: Kind | "all"; label: string; single: string; icon: LucideIcon; tone: Tone }[] = [
  { id: "all", label: "All", single: "Volume", icon: Layers, tone: "neutral" },
  { id: "database", label: "Databases", single: "Database", icon: Database, tone: "info" },
  { id: "cache", label: "Caches", single: "Cache", icon: Zap, tone: "warning" },
  { id: "app", label: "App data", single: "App data", icon: FolderOpen, tone: "brand" },
]

function kindOf(attachedTo: string): Kind {
  if (/redis|cache/i.test(attachedTo)) return "cache"
  if (/postgres|mysql|mariadb|mongo|db/i.test(attachedTo)) return "database"
  return "app"
}

export function StorageView() {
  const state = useDeployState()
  const now = useNow()
  const [id, setId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all")
  const [backup, setBackup] = useState("all")
  if (!state) return <PageSkeleton variant="cards" />
  const selected = state.volumes.find((volume) => volume.id === id) ?? null
  const total = Math.round(state.volumes.reduce((sum, volume) => sum + volume.sizeGb, 0) * 10) / 10
  const q = search.trim().toLowerCase()
  const rows = state.volumes.filter((volume) =>
    (kindFilter === "all" || kindOf(volume.attachedTo) === kindFilter)
    && (backup === "all" || (backup === "yes" ? Boolean(volume.lastBackupAt) : !volume.lastBackupAt))
    && (!q || [volume.name, volume.path, volume.attachmentLabel].some((text) => text.toLowerCase().includes(q))))
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
        <SectionHeading title="Volumes" count={rows.length} />
        <div className="page-toolbar mb-3">
          <SearchField value={search} onChange={setSearch} placeholder="Search volumes, paths, or workloads" label="Search volumes" />
          <div className="segmented" role="group" aria-label="Filter by kind">
            {KINDS.map((kind) => {
              const Icon = kind.icon
              return <button key={kind.id} type="button" aria-pressed={kindFilter === kind.id} onClick={() => setKindFilter(kind.id)}><Icon aria-hidden className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />{kind.label}</button>
            })}
          </div>
          <SelectInput aria-label="Backups" value={backup} onChange={(event) => setBackup(event.target.value)}>
            <option value="all">Any backup state</option>
            <option value="yes">Backed up</option>
            <option value="no">No backup</option>
          </SelectInput>
        </div>
        {state.volumes.length === 0 ? <EmptyPanel icon={HardDrive} title="No volumes" body="No volumes are attached." /> : rows.length === 0 ? <EmptyPanel icon={SearchX} title="No volumes match" body="Try another kind, backup state, or search." /> : (
          <div className="card-grid card-grid-3">
            {rows.map((volume) => {
              const kind = kindOf(volume.attachedTo)
              const meta = KINDS.find((item) => item.id === kind) ?? KINDS[0]
              const share = total ? (volume.sizeGb / total) * 100 : 0
              return (
                <button key={volume.id} type="button" className="card volume-card pressable" data-kind={kind} data-interactive onClick={() => setId(volume.id)}>
                  <span className="card-head">
                    <IconTile icon={meta.icon} tone={meta.tone} />
                    <span className="min-w-0"><span className="card-title block">{volume.name}</span><span className="card-sub block">{volume.attachmentLabel}</span></span>
                    <Tag tone={meta.tone}>{meta.single}</Tag>
                  </span>
                  <span className="volume-size"><strong>{volume.sizeGb}</strong> GB<small>{share.toFixed(0)}% of allocated</small></span>
                  <SegmentMeter value={share} label={`${volume.name} share of allocated storage`} />
                  <code className="code-chip">{volume.path}</code>
                  <span className="volume-foot">
                    <span className="volume-backup" data-ok={Boolean(volume.lastBackupAt)}><ArchiveRestore size={13} aria-hidden />{volume.lastBackupAt ? `Backup ${formatRelative(volume.lastBackupAt, now)}` : "No backup recorded"}</span>
                    <span className="text-faint">Created {formatRelative(volume.createdAt, now)}</span>
                  </span>
                </button>
              )
            })}
            {server ? (
              <div className="card grid-slot storage-slot" data-rem3={(3 - (rows.length % 3)) % 3} data-rem2={rows.length % 2}>
                <IconTile icon={HardDrive} tone="brand" size="lg" />
                <strong>{formatGb(server.storageTotalGb - server.storageUsedGb)} free on {server.name}</strong>
                <small>New volumes are created when you add a database or cache to a project.</small>
                <SegmentMeter value={diskPct} label="Server disk used" />
                <span className="storage-slot-foot"><span>{diskPct.toFixed(0)}% used</span><Link href="/databases" className="text-[var(--brand-primary)] font-semibold">Add a database →</Link></span>
              </div>
            ) : null}
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
