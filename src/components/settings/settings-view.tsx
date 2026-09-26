"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, Download, FolderGit2, Info, Lock, Palette, RefreshCw, Rocket, Server, Settings, SlidersHorizontal, Wrench, type LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { CopyButton, PageSkeleton } from "@/components/ui/bits"
import { SelectInput, TextInput } from "@/components/ui/fields"
import { IconTile, Tag } from "@/components/ui/kit"
import { ConfirmDialog } from "@/components/ui/overlays"
import { ServerStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { formatRelative } from "@/lib/deploy/format"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import type { EnvironmentName, MotionChoice, Settings as SettingsShape } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

const SECTIONS = ["General", "Appearance", "Notifications", "Git providers", "Deployment defaults", "Security", "Server agent", "Advanced"] as const
type Section = (typeof SECTIONS)[number]

const SECTION_META: Record<Section, { icon: LucideIcon; blurb: string }> = {
  General: { icon: SlidersHorizontal, blurb: "Workspace identity, your profile, and where data lives." },
  Appearance: { icon: Palette, blurb: "Shell appearance and how much the interface moves." },
  Notifications: { icon: Bell, blurb: "Which changes show up in your notification feed." },
  "Git providers": { icon: FolderGit2, blurb: "Repositories Arcellite can import and redeploy from." },
  "Deployment defaults": { icon: Rocket, blurb: "Branch, ports, builds, and rollback for new projects." },
  Security: { icon: Lock, blurb: "How secrets and sensitive values are handled." },
  "Server agent": { icon: Server, blurb: "The agent that runs work on each of your servers." },
  Advanced: { icon: Wrench, blurb: "Developer tools, exports, and demo data." },
}

const TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Africa/Addis_Ababa", "Asia/Dubai", "Asia/Tokyo"]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="min-w-0"><p className="setting-label">{label}</p>{hint ? <p className="setting-hint">{hint}</p> : null}</div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Group({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="setting-group">
      <h3>{title}</h3>
      <div className="setting-rows">{children}</div>
      {footer ? <div className="setting-footer">{footer}</div> : null}
    </section>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle pressable" onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

export function SettingsView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow(15000)
  const [section, setSection] = useState<Section>("General")
  const [disconnect, setDisconnect] = useState(false)
  const [reset, setReset] = useState(false)
  if (!state) return <PageSkeleton />
  const settings = state.settings
  const set = (patch: Partial<SettingsShape>, title = "Setting saved") => void deploy.updateSettings(patch).then(() => toast({ title }))
  const secrets = state.projects.reduce((sum, project) => sum + project.env.filter((item) => item.secret).length, 0)
  const variables = state.projects.reduce((sum, project) => sum + project.env.length, 0)

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
          <div className="settings-stack">
            {section === "General" ? <>
              <form onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                set({
                  workspaceName: String(data.get("workspace") || settings.workspaceName),
                  displayName: String(data.get("name") || settings.displayName),
                  timezone: String(data.get("timezone") || settings.timezone),
                }, "General settings saved")
              }}>
                <Group title="Workspace" footer={<Button type="submit" variant="primary" size="sm">Save changes</Button>}>
                  <Row label="Workspace name" hint="Shown in the sidebar and the overview greeting."><TextInput name="workspace" defaultValue={settings.workspaceName} /></Row>
                  <Row label="Display name" hint="How you appear in activity and audit entries."><TextInput name="name" defaultValue={settings.displayName} /></Row>
                  <Row label="Time zone" hint="Saved with your profile. Timestamps currently follow this browser's clock.">
                    <SelectInput name="timezone" defaultValue={settings.timezone}>{TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone.replace("_", " ")}</option>)}</SelectInput>
                  </Row>
                </Group>
              </form>
              <Group title="About this workspace">
                <Row label="Plan"><Tag tone="brand">Self-hosted</Tag></Row>
                <Row label="Version" hint="Phase 1 control plane with the mock provider."><code className="table-code">v0.1.0</code></Row>
                <Row label="Contents"><span className="setting-value">{state.projects.length} projects · {state.servers.length} server · {state.domains.length} domains</span></Row>
                <Row label="Data location" hint="Nothing leaves this browser in Phase 1."><span className="setting-value">Browser local storage</span></Row>
              </Group>
            </> : null}

            {section === "Appearance" ? <>
              <Group title="Theme">
                <div className="appearance-preview" aria-hidden>
                  <div className="appearance-side"><i /><i /><i /><i /></div>
                  <div className="appearance-main"><i className="w-24" /><i className="w-40" /><div className="appearance-cards"><b /><b /><b /></div></div>
                </div>
                <Row label="Split shell" hint="Dark navigation and a white workspace, on every device. The workspace never switches to dark mode."><Tag tone="success">Active</Tag></Row>
              </Group>
              <Group title="Motion">
                <div className="choice-cards" role="radiogroup" aria-label="Motion">
                  {([["system", "System", "Follow the browser's reduced-motion setting."], ["full", "Full", "Springs, sheet gestures, and animated icons."], ["reduce", "Reduce", "Short fades instead of movement."]] as [MotionChoice, string, string][]).map(([value, title, body]) => (
                    <button key={value} type="button" role="radio" aria-checked={settings.motion === value} className="choice-card pressable" onClick={() => set({ motion: value }, "Motion updated")}>
                      <strong>{title}</strong><small>{body}</small>
                    </button>
                  ))}
                </div>
              </Group>
            </> : null}

            {section === "Notifications" ? <>
              <Group title="Deployments">
                <Row label="Deployment succeeded" hint="A release finished its health check and is serving."><Toggle label="Deployment succeeded" checked={settings.notifyDeploySuccess} onChange={(value) => set({ notifyDeploySuccess: value })} /></Row>
                <Row label="Deployment failed" hint="A build or health check failed. Recommended."><Toggle label="Deployment failed" checked={settings.notifyDeployFailure} onChange={(value) => set({ notifyDeployFailure: value })} /></Row>
              </Group>
              <Group title="Infrastructure" footer={<Link href="/notifications" className="text-xs text-muted hover:text-[var(--brand-primary)]">Open notifications →</Link>}>
                <Row label="Domains and certificates" hint="Verification results and DNS changes."><Toggle label="Domains and certificates" checked={settings.notifyDomains} onChange={(value) => set({ notifyDomains: value })} /></Row>
                <Row label="Servers and containers" hint="Agent connections, restarts, and stopped containers."><Toggle label="Servers and containers" checked={settings.notifyServer} onChange={(value) => set({ notifyServer: value })} /></Row>
              </Group>
            </> : null}

            {section === "Git providers" ? <>
              <Group title="Connected">
                <div className="provider-card">
                  <IconTile icon={FolderGit2} tone={state.github.connected ? "brand" : "neutral"} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="setting-label">GitHub {state.github.connected ? <Tag tone="success">Connected</Tag> : <Tag>Not connected</Tag>}</p>
                    <p className="setting-hint">{state.github.connected ? `${state.github.accountName} · @${state.github.accountLogin} · ${state.repositories.length} repositories visible` : "Connect to import repositories and redeploy on push."}</p>
                  </div>
                  {state.github.connected ? (
                    <Button variant="danger" size="sm" onClick={() => setDisconnect(true)}>Disconnect</Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => void deploy.connectGitHub().then(() => toast({ title: "GitHub connected" }))}>Connect</Button>
                  )}
                </div>
                {state.github.connected ? <>
                  <Row label="Access" hint="What the connection can do."><span className="setting-value">Read code · read metadata · commit status</span></Row>
                  <Row label="Credentials" hint="No personal access token is stored. A later phase uses a GitHub App."><Tag tone="info">Simulated</Tag></Row>
                </> : null}
              </Group>
              <Group title="More providers">
                <Row label="GitLab" hint="Self-managed and gitlab.com."><Tag>Later phase</Tag></Row>
                <Row label="Bitbucket"><Tag>Later phase</Tag></Row>
                <Row label="Any Git URL" hint="Public repositories work today from New project."><Tag tone="success">Available</Tag></Row>
              </Group>
            </> : null}

            {section === "Deployment defaults" ? <>
              <form onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                set({
                  defaultBranch: String(data.get("branch") || "main"),
                  defaultEnvironment: String(data.get("environment")) as EnvironmentName,
                  portAllocation: String(data.get("ports")) as "auto" | "manual",
                  portStart: Number(data.get("start") || 8082),
                  buildConcurrency: Number(data.get("concurrency") || 1),
                }, "Deployment defaults saved")
              }}>
                <Group title="New projects" footer={<Button type="submit" variant="primary" size="sm">Save defaults</Button>}>
                  <Row label="Default branch" hint="Branch picked when importing a repository."><TextInput name="branch" defaultValue={settings.defaultBranch} /></Row>
                  <Row label="Default environment">
                    <SelectInput name="environment" defaultValue={settings.defaultEnvironment}>
                      <option value="production">Production</option>
                      <option value="preview">Preview</option>
                      <option value="development">Development</option>
                    </SelectInput>
                  </Row>
                  <Row label="Port allocation" hint="How the host port is chosen for a new project.">
                    <SelectInput name="ports" defaultValue={settings.portAllocation}>
                      <option value="auto">Assign the next free port</option>
                      <option value="manual">Ask every time</option>
                    </SelectInput>
                  </Row>
                  <Row label="First port" hint="Automatic assignment starts here."><TextInput name="start" defaultValue={String(settings.portStart)} inputMode="numeric" /></Row>
                  <Row label="Parallel builds" hint="Builds allowed at once on each server.">
                    <SelectInput name="concurrency" defaultValue={String(settings.buildConcurrency)}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</SelectInput>
                  </Row>
                </Group>
              </form>
              <Group title="Releases">
                <Row label="Keep the previous release on failure" hint="If a new release fails its health check, traffic stays on the last healthy one."><Toggle label="Keep previous release" checked={settings.autoRollback} onChange={(value) => set({ autoRollback: value })} /></Row>
              </Group>
            </> : null}

            {section === "Security" ? <>
              <Group title="Secrets">
                <Row label="Redact secrets in logs" hint="Values that look like passwords or tokens are masked in the log stream."><Toggle label="Redact secrets in logs" checked={settings.redactSecrets} onChange={(value) => set({ redactSecrets: value }, value ? "Log redaction on" : "Log redaction off")} /></Row>
                <Row label="Stored variables" hint="Managed per project on the Environment page."><Link href="/environment" className="setting-value hover:text-[var(--brand-primary)]">{variables} variables · {secrets} secret →</Link></Row>
                <Row label="Log retention" hint="How long runtime and build lines are kept.">
                  <SelectInput value={String(settings.logRetentionDays)} onChange={(event) => set({ logRetentionDays: Number(event.target.value) }, "Retention updated")}>
                    {[3, 7, 14, 30, 90].map((days) => <option key={days} value={days}>{days} days</option>)}
                  </SelectInput>
                </Row>
              </Group>
              <Group title="Access">
                <Row label="Sign-in" hint="Phase 1 has no production sign-in. Anyone who can open this browser profile can change the demo workspace."><Tag tone="warning">Not enforced</Tag></Row>
                <Row label="Destructive actions" hint="Stopping containers, removing domains, and deleting projects always ask first."><Tag tone="success">Confirmation on</Tag></Row>
              </Group>
            </> : null}

            {section === "Server agent" ? <>
              <Group title="Agents">
                {state.servers.map((server) => (
                  <div key={server.id} className="provider-card">
                    <IconTile icon={Server} tone="brand" />
                    <div className="min-w-0 flex-1">
                      <p className="setting-label">{server.name}</p>
                      <p className="setting-hint">Agent {server.agentVersion} · Docker {server.dockerVersion} · {server.refreshedAt ? `checked ${formatRelative(server.refreshedAt, now)}` : "streaming"}</p>
                    </div>
                    <ServerStatusView value={server.status} />
                    <Button variant="secondary" size="sm" onClick={() => void deploy.restartAgent(server.id).then(() => toast({ title: "Agent restart requested", description: server.name }))}><RefreshCw aria-hidden />Restart</Button>
                  </div>
                ))}
              </Group>
              <Group title="Install on another server">
                <div className="setting-code">
                  <code>curl -fsSL https://deploy.arcellite.com/install.sh | sh</code>
                  <CopyButton value="curl -fsSL https://deploy.arcellite.com/install.sh | sh" />
                </div>
                <p className="setting-note"><Info aria-hidden />The real agent ships in Phase 2. This command is a preview and does nothing yet.</p>
              </Group>
            </> : null}

            {section === "Advanced" ? <>
              <Group title="Developer">
                <Row label="Developer mode" hint="Shows the simulate-failure control on every project. A domain ending in .invalid always fails verification."><Toggle label="Developer mode" checked={settings.developerMode} onChange={(value) => set({ developerMode: value }, value ? "Developer mode on" : "Developer mode off")} /></Row>
                <Row label="Export workspace" hint="Download the demo state as JSON. Secrets are included, so keep the file private.">
                  <Button variant="secondary" size="sm" onClick={() => {
                    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }))
                    const link = document.createElement("a")
                    link.href = url
                    link.download = "arcellite-workspace.json"
                    link.click()
                    URL.revokeObjectURL(url)
                  }}><Download aria-hidden />Export</Button>
                </Row>
              </Group>
              <Group title="Danger zone">
                <Row label="Reset demo data" hint="Projects, deployments, and domains return to the original lab fixture."><Button variant="danger" size="sm" onClick={() => setReset(true)}>Reset</Button></Row>
              </Group>
            </> : null}
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
