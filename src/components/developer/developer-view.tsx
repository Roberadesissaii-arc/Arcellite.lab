"use client"

import { useState } from "react"
import { Braces, Code2, Database, Download, FlaskConical, HardDrive, Layers, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/ui/bits"
import { SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { ConfirmDialog } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import type { AppState } from "@/lib/deploy/types"

const COLLECTIONS: { key: keyof AppState; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "deployments", label: "Deployments" },
  { key: "containers", label: "Containers" },
  { key: "domains", label: "Domains" },
  { key: "volumes", label: "Volumes" },
  { key: "databases", label: "Databases" },
  { key: "activity", label: "Activity events" },
  { key: "operationalLogs", label: "Log lines" },
  { key: "repositories", label: "Repositories" },
  { key: "servers", label: "Servers" },
]

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle pressable" onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

/** Tools for building against the control plane: raw state, simulations, and workspace data. */
export function DeveloperView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const [reset, setReset] = useState<"demo" | "empty" | null>(null)
  // Simulations, resets, and raw export exist only on a provider with mock dev tools.
  const dev = deploy.dev
  if (!state) return <PageSkeleton variant="detail" />
  const json = JSON.stringify(state)
  const sizeKb = new Blob([json]).size / 1024
  const records = COLLECTIONS.reduce((sum, item) => sum + (Array.isArray(state[item.key]) ? (state[item.key] as unknown[]).length : 0), 0)

  function exportState() {
    if (!dev) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(dev.exportWorkspace(), null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "arcellite-workspace.json"
    link.click()
    URL.revokeObjectURL(url)
    toast({ title: "Workspace exported", description: "arcellite-workspace.json" })
  }

  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={Code2} kicker="Account" title="Developer tools" description="Inspect the workspace state, turn on simulations for testing, and export or reset the data this browser holds." actions={dev ? <Button variant="primary" onClick={exportState}><Download aria-hidden />Export JSON</Button> : undefined} />
      <StatGrid>
        <StatCard icon={Layers} tone="brand" label="Provider" value={deploy.capabilities.mode === "mock" ? "Mock" : "Server"} detail={deploy.capabilities.mode === "mock" ? "Phase 1 · in the browser" : "Control plane"} />
        <StatCard icon={Braces} tone="info" label="Schema" value={`v${state.schema}`} detail="Stored state version" />
        <StatCard icon={HardDrive} tone="neutral" label="State size" value={<>{sizeKb.toFixed(1)}<small> KB</small></>} detail="localStorage" />
        <StatCard icon={Database} tone="success" label="Records" value={records} detail={`Across ${COLLECTIONS.length} collections`} />
      </StatGrid>

      <div className="dev-grid">
        {dev ? <section>
          <SectionHeading title="Simulations" />
          <div className="setting-group">
            <div className="setting-rows">
              <div className="setting-row">
                <div className="min-w-0"><p className="setting-label">Developer mode</p><p className="setting-hint">Shows the simulate-failure control on every project. A domain ending in .invalid always fails verification.</p></div>
                <div className="setting-control"><Toggle label="Developer mode" checked={state.settings.developerMode} onChange={(value) => void deploy.updateSettings({ developerMode: value }).then(() => toast({ title: value ? "Developer mode on" : "Developer mode off" }))} /></div>
              </div>
              <div className="setting-row">
                <div className="min-w-0"><p className="setting-label">Load demo data</p><p className="setting-hint">Replace this workspace with sample projects, deployments, and domains.</p></div>
                <div className="setting-control"><Button variant="secondary" size="sm" onClick={() => setReset("demo")}><FlaskConical aria-hidden />Load demo</Button></div>
              </div>
              <div className="setting-row">
                <div className="min-w-0"><p className="setting-label">Clear workspace</p><p className="setting-hint">Remove every project, deployment, domain, and log. This server stays registered.</p></div>
                <div className="setting-control"><Button variant="danger" size="sm" onClick={() => setReset("empty")}><Trash2 aria-hidden />Clear</Button></div>
              </div>
            </div>
          </div>
        </section> : null}
        <section>
          <SectionHeading title="State" aside={<Tag tone="brand">{records} records</Tag>} />
          <ul className="panel dev-collections">
            {COLLECTIONS.map((item) => {
              const count = Array.isArray(state[item.key]) ? (state[item.key] as unknown[]).length : 0
              return <li key={item.key}><code>{item.key}</code><span className="flex-1 text-faint">{item.label}</span><strong>{count}</strong></li>
            })}
          </ul>
        </section>
      </div>

      <ConfirmDialog
        open={reset !== null}
        title={reset === "demo" ? "Load demo data?" : "Clear this workspace?"}
        body={reset === "demo" ? "Everything in the workspace is replaced with the sample lab. Theme and motion preferences stay." : "Projects, deployments, domains, volumes, and logs are removed. Settings stay."}
        confirmLabel={reset === "demo" ? "Load demo" : "Clear workspace"}
        danger
        onOpenChange={(open) => { if (!open) setReset(null) }}
        onConfirm={() => {
          if (!dev) return
          const action = reset === "demo" ? dev.resetDemo() : dev.clearWorkspace()
          void action.then(() => {
            toast({ title: reset === "demo" ? "Demo data loaded" : "Workspace cleared" })
            setReset(null)
          })
        }}
      />
    </div>
  )
}
