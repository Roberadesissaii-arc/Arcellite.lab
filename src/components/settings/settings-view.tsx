"use client"

import { useState } from "react"
import { FolderGit2, Lock, Palette, Rocket, Server, Settings, SlidersHorizontal, Wrench, type LucideIcon } from "lucide-react"
import { IconTile } from "@/components/ui/kit"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/ui/bits"
import { Field, SelectInput, TextInput } from "@/components/ui/fields"
import { ConfirmDialog } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import type { EnvironmentName, MotionChoice } from "@/lib/deploy/types"

const SECTIONS = ["General", "Appearance", "Git providers", "Deployment defaults", "Security", "Server agent", "Advanced"] as const

const SECTION_META: Record<(typeof SECTIONS)[number], { icon: LucideIcon; blurb: string }> = {
  General: { icon: SlidersHorizontal, blurb: "Workspace name and how you appear." },
  Appearance: { icon: Palette, blurb: "Shell appearance and motion." },
  "Git providers": { icon: FolderGit2, blurb: "Repositories Arcellite can import." },
  "Deployment defaults": { icon: Rocket, blurb: "Branch, ports, and environment for new projects." },
  Security: { icon: Lock, blurb: "How secrets are shown in the interface." },
  "Server agent": { icon: Server, blurb: "The agent that runs work on your server." },
  Advanced: { icon: Wrench, blurb: "Developer tools and demo data." },
}

export function SettingsView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("General")
  const [disconnect, setDisconnect] = useState(false)
  const [reset, setReset] = useState(false)
  if (!state) return <PageSkeleton />
  const settings = state.settings

  return (
    <div className="page">
      <PageHeader icon={Settings} kicker="Workspace" title="Settings" description="Preferences for this browser. Phase 1 stores them locally." />
      <div className="settings-layout mt-6">
        <nav aria-label="Settings sections" className="settings-nav">
          {SECTIONS.map((item) => {
            const Icon = SECTION_META[item].icon
            return (
              <button key={item} type="button" aria-current={section === item} onClick={() => setSection(item)}>
                <Icon aria-hidden />{item}
              </button>
            )
          })}
        </nav>
        <div className="settings-panel">
          <div className="settings-panel-head">
            <IconTile icon={SECTION_META[section].icon} tone="brand" />
            <div><h2>{section}</h2><p>{SECTION_META[section].blurb}</p></div>
          </div>
          <div className="settings-body">
          {section === "General" ? (
            <form className="space-y-4" onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              void deploy.updateSettings({
                workspaceName: String(data.get("workspace") || settings.workspaceName),
                displayName: String(data.get("name") || settings.displayName),
              }).then(() => toast({ title: "General settings saved" }))
            }}>
              <Field label="Workspace"><TextInput name="workspace" defaultValue={settings.workspaceName} /></Field>
              <Field label="Display name"><TextInput name="name" defaultValue={settings.displayName} /></Field>
              <Button type="submit" variant="primary">Save</Button>
            </form>
          ) : null}
          {section === "Appearance" ? (
            <div className="space-y-4">
              <section className="panel p-4" aria-label="Appearance">
                <div className="mb-3 flex h-16 overflow-hidden rounded-lg border border-line" aria-hidden><div className="w-12 bg-[var(--sidebar-bg)]" /><div className="flex-1 bg-white p-3"><div className="h-2 w-20 rounded bg-sunken" /><div className="mt-2 h-2 w-32 rounded bg-sunken" /></div></div>
                <p className="text-sm font-semibold">Arcellite appearance</p>
                <p className="mt-1 text-sm text-muted">Dark navigation and a white workspace, on every device.</p>
              </section>
              <Field label="Motion" hint="Reduce replaces springs with a short fade. System follows the browser.">
                <SelectInput value={settings.motion} onChange={(event) => void deploy.updateSettings({ motion: event.target.value as MotionChoice })}>
                  <option value="system">System</option>
                  <option value="reduce">Reduce</option>
                  <option value="full">Full</option>
                </SelectInput>
              </Field>
            </div>
          ) : null}
          {section === "Git providers" ? (
            <div>
              <p className="font-medium">GitHub</p>
              <p className="mt-1 text-sm text-muted">
                {state.github.connected ? `Connected as ${state.github.accountName} · ${state.github.accountLogin}. No personal access token is stored.` : "Not connected."}
              </p>
              <p className="mt-3 text-sm text-muted">A later phase uses a GitHub App. This connection is simulated.</p>
              {state.github.connected ? (
                <Button className="mt-4" variant="danger" onClick={() => setDisconnect(true)}>Disconnect</Button>
              ) : (
                <Button className="mt-4" variant="primary" onClick={() => void deploy.connectGitHub().then(() => toast({ title: "GitHub connected" }))}>Connect GitHub</Button>
              )}
            </div>
          ) : null}
          {section === "Deployment defaults" ? (
            <form className="space-y-4" onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              void deploy.updateSettings({
                defaultBranch: String(data.get("branch") || "main"),
                defaultEnvironment: String(data.get("environment")) as EnvironmentName,
                portAllocation: String(data.get("ports")) as "auto" | "manual",
                portStart: Number(data.get("start") || 8082),
              }).then(() => toast({ title: "Deployment defaults saved" }))
            }}>
              <Field label="Default branch"><TextInput name="branch" defaultValue={settings.defaultBranch} /></Field>
              <Field label="Default environment">
                <SelectInput name="environment" defaultValue={settings.defaultEnvironment}>
                  <option value="production">Production</option>
                  <option value="preview">Preview</option>
                  <option value="development">Development</option>
                </SelectInput>
              </Field>
              <Field label="Port allocation">
                <SelectInput name="ports" defaultValue={settings.portAllocation}>
                  <option value="auto">Assign the next free port</option>
                  <option value="manual">Ask every time</option>
                </SelectInput>
              </Field>
              <Field label="First port"><TextInput name="start" defaultValue={String(settings.portStart)} inputMode="numeric" /></Field>
              <Button type="submit" variant="primary">Save defaults</Button>
            </form>
          ) : null}
          {section === "Security" ? (
            <div className="space-y-3 text-sm">
              <p>Phase 1 has no production sign-in. Anyone who can open this browser profile can change the demo workspace.</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.redactSecrets} onChange={(event) => void deploy.updateSettings({ redactSecrets: event.target.checked }).then(() => toast({ title: event.target.checked ? "Log redaction on" : "Log redaction off" }))} />
                Redact secrets in logs
              </label>
              <p className="text-muted">Values that look like passwords or tokens are masked in the log stream.</p>
            </div>
          ) : null}
          {section === "Server agent" ? (
            <div className="text-sm">
              <p>Mock provider · version 0.1.0</p>
              <p className="mt-2 text-muted">The agent that will talk to Docker is not installed. Server pages show the shape of that connection. Restart and disconnect on the server page only change this demo.</p>
            </div>
          ) : null}
          {section === "Advanced" ? (
            <div className="space-y-4 text-sm">
              <p>Demo infrastructure. The mock provider is the only deployment backend in this build.</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.developerMode} onChange={(event) => void deploy.updateSettings({ developerMode: event.target.checked })} />
                Developer mode
              </label>
              <p className="text-muted">Developer mode shows the simulate-failure control on every project. API Sandbox always has it. A domain ending in .invalid fails verification.</p>
              <Button variant="danger" onClick={() => setReset(true)}>Reset demo data</Button>
            </div>
          ) : null}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={disconnect}
        title="Disconnect GitHub?"
        body="Repository deploys pause until you connect again. Existing projects stay in the workspace."
        confirmLabel="Disconnect"
        danger
        onOpenChange={setDisconnect}
        onConfirm={() => {
          void deploy.disconnectGitHub().then(() => {
            toast({ title: "GitHub disconnected" })
            setDisconnect(false)
          })
        }}
      />
      <ConfirmDialog
        open={reset}
        title="Reset demo data?"
        body="Projects, deployments, and domains return to the original lab fixture. Theme and motion preferences stay."
        confirmLabel="Reset demo"
        danger
        onOpenChange={setReset}
        onConfirm={() => {
          void deploy.resetDemo().then(() => {
            toast({ title: "Demo data reset" })
            setReset(false)
          })
        }}
      />
    </div>
  )
}
