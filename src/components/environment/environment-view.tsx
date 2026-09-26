"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Copy, Eye, EyeOff, FolderKanban, KeyRound, Layers, Lock, LockOpen, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { copyText, PageSkeleton } from "@/components/ui/bits"
import { Field, SelectInput, TextInput } from "@/components/ui/fields"
import { EmptyPanel, IconTile, SearchField, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { ConfirmDialog, Modal } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { envError } from "@/components/projects/env-editor"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import type { EnvironmentVariable } from "@/lib/deploy/types"

type Scope = EnvironmentVariable["scope"]
const SCOPES: { value: Scope | "any"; label: string }[] = [
  { value: "any", label: "All scopes" },
  { value: "all", label: "Shared" },
  { value: "production", label: "Production" },
  { value: "preview", label: "Preview" },
  { value: "development", label: "Development" },
]
const SCOPE_LABEL: Record<Scope, string> = { all: "All environments", production: "Production", preview: "Preview", development: "Development" }
const SCOPE_TONE = { all: "neutral", production: "brand", preview: "info", development: "warning" } as const

function mask(value: string) {
  return "•".repeat(Math.min(Math.max(value.length, 8), 18))
}

export function EnvironmentView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const [picked, setPicked] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope | "any">("any")
  const [search, setSearch] = useState("")
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<EnvironmentVariable | null>(null)
  const [draft, setDraft] = useState({ key: "", value: "", scope: "all" as Scope, secret: true })
  const [error, setError] = useState<string | null>(null)

  const project = state?.projects.find((item) => item.id === picked) ?? state?.projects[0] ?? null
  const rows = useMemo(() => {
    if (!project) return []
    const q = search.trim().toLowerCase()
    return project.env.filter((item) => (scope === "any" || item.scope === scope) && (!q || item.key.toLowerCase().includes(q)))
  }, [project, scope, search])

  if (!state) return <PageSkeleton />
  const all = state.projects.flatMap((item) => item.env)
  const secrets = all.filter((item) => item.secret).length
  const configured = state.projects.filter((item) => item.env.length > 0).length
  const redact = state.settings.redactSecrets

  async function save(next: EnvironmentVariable[], message: string) {
    if (!project) return false
    const problem = envError(next)
    if (problem) {
      setError(problem)
      return false
    }
    await deploy.updateProject(project.id, { env: next })
    toast({ title: message, description: `${project.name} · redeploy to apply` })
    return true
  }

  return (
    <div className="page page-wide page-stack">
      <PageHeader
        icon={KeyRound}
        kicker="Observe"
        title="Environment"
        description="Variables and secrets for every project, kept apart from source code. Secrets stay masked and are injected only when a container starts."
        actions={project ? <Button variant="primary" onClick={() => { setError(null); setDraft({ key: "", value: "", scope: "all", secret: true }); setAdding(true) }}><Plus aria-hidden />Add variable</Button> : null}
      />
      <StatGrid>
        <StatCard icon={Layers} tone="brand" label="Variables" value={all.length} detail={`Across ${state.projects.length} projects`} />
        <StatCard icon={Lock} tone="success" label="Secrets" value={secrets} detail="Masked by default" />
        <StatCard icon={FolderKanban} tone="info" label="Projects configured" value={`${configured}/${state.projects.length}`} detail="Have at least one variable" />
        <StatCard icon={ShieldCheck} tone={redact ? "success" : "warning"} label="Redaction" value={redact ? "On" : "Off"} href="/settings" detail={redact ? "Secrets hidden in logs" : "Turn on in Settings"} />
      </StatGrid>

      {state.projects.length === 0 ? (
        <EmptyPanel icon={KeyRound} title="No projects yet" body="Create a project to give it environment variables." action={<Link href="/projects/new" className="btn btn-primary">New project</Link>} />
      ) : (
        <div className="page-stack">
          <section>
            <SectionHeading title="Projects" count={state.projects.length} />
            <ul className="env-project-cards">
              {state.projects.map((item) => {
                const secretCount = item.env.filter((variable) => variable.secret).length
                const selected = item.id === project?.id
                return (
                  <li key={item.id}>
                    <button type="button" className="env-project-card pressable" aria-current={selected} onClick={() => { setPicked(item.id); setRevealed({}) }}>
                      <span className="env-project-head">
                        <IconTile icon={FolderKanban} tone={selected ? "brand" : "neutral"} />
                        <span className="min-w-0 flex-1"><strong>{item.name}</strong><small className="capitalize">{item.environment}</small></span>
                        {selected ? <Tag tone="brand">Selected</Tag> : null}
                      </span>
                      <span className="env-project-stats">
                        <span><b>{item.env.length}</b> variables</span>
                        <span><b>{secretCount}</b> secret{secretCount === 1 ? "" : "s"}</span>
                        <span><b>{new Set(item.env.map((variable) => variable.scope)).size}</b> scopes</span>
                      </span>
                      <SegmentMeter value={item.env.length ? (secretCount / item.env.length) * 100 : 0} label={`${item.name} share of secret variables`} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {project ? (
            <section className="min-w-0 env-detail">
              <SectionHeading title={project.name} count={rows.length} aside={<Link href={`/projects/${project.id}/environment`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-[var(--brand-primary)]">Project settings<ArrowUpRight size={13} aria-hidden /></Link>} />
              <div className="page-toolbar">
                <SearchField value={search} onChange={setSearch} placeholder="Search keys" label="Search variables" />
                <div className="segmented" role="group" aria-label="Filter by scope">
                  {SCOPES.map((item) => <button key={item.value} type="button" aria-pressed={scope === item.value} onClick={() => setScope(item.value)}>{item.label}</button>)}
                </div>
              </div>
              <div className="mt-3">
                {rows.length === 0 ? (
                  <EmptyPanel icon={KeyRound} title={project.env.length ? "No variables match" : "No variables yet"} body={project.env.length ? "Try another scope or search." : "Add a variable to make it available to this project on its next deploy."} />
                ) : (
                  <div className="panel env-table" role="table" aria-label={`${project.name} variables`}>
                    <div className="env-row env-head" role="row">
                      <span role="columnheader">Key</span><span role="columnheader">Value</span><span role="columnheader">Scope</span><span role="columnheader" className="sr-only">Actions</span>
                    </div>
                    {rows.map((item) => {
                      const show = !item.secret || revealed[item.id]
                      return (
                        <div key={item.id} className="env-row" role="row">
                          <span role="cell" className="env-key">
                            <span className="env-lock" data-secret={item.secret} title={item.secret ? "Secret" : "Plain value"}>{item.secret ? <Lock aria-hidden /> : <LockOpen aria-hidden />}</span>
                            <code>{item.key}</code>
                          </span>
                          <span role="cell" className="env-value"><code data-masked={!show}>{show ? item.value || "—" : mask(item.value)}</code></span>
                          <span role="cell"><Tag tone={SCOPE_TONE[item.scope]}>{SCOPE_LABEL[item.scope]}</Tag></span>
                          <span role="cell" className="env-actions">
                            {item.secret ? (
                              <button type="button" className="icon-btn" aria-label={show ? `Hide ${item.key}` : `Reveal ${item.key}`} onClick={() => setRevealed((current) => ({ ...current, [item.id]: !current[item.id] }))}>{show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</button>
                            ) : null}
                            <button type="button" className="icon-btn" aria-label={`Copy ${item.key}`} onClick={() => void copyText(item.value).then((ok) => toast(ok ? { title: `${item.key} copied` } : { title: "Could not copy", tone: "danger" }))}><Copy aria-hidden /></button>
                            <button type="button" className="icon-btn" aria-label={`Remove ${item.key}`} onClick={() => setRemoving(item)}><Trash2 aria-hidden /></button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          <section className="env-security" aria-label="How secrets are handled">
            <div><ShieldCheck aria-hidden /><p><strong>Never in the image.</strong> Values are written to the container when it starts, not baked into the build.</p></div>
            <div><EyeOff aria-hidden /><p><strong>Masked by default.</strong> Secrets stay hidden here and are redacted from logs.</p></div>
            <div><Lock aria-hidden /><p><strong>Local in Phase 1.</strong> Everything is stored in this browser until the server agent ships.</p></div>
          </section>
        </div>
      )}

      <Modal open={adding} onOpenChange={setAdding} title="Add a variable" description={project ? `Available to ${project.name} after its next deploy.` : undefined}>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          if (!project) return
          setError(null)
          const next = [...project.env, { id: crypto.randomUUID(), key: draft.key.trim(), value: draft.value, scope: draft.scope, secret: draft.secret }]
          if (!draft.key.trim()) { setError("Name the variable."); return }
          void save(next, "Variable added").then((ok) => { if (ok) setAdding(false) })
        }}>
          <Field label="Key" hint="Uppercase letters, numbers, and underscores.">
            <TextInput value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value.toUpperCase() })} placeholder="DATABASE_URL" className="font-mono" autoFocus />
          </Field>
          <Field label="Value">
            <TextInput value={draft.value} type={draft.secret ? "password" : "text"} onChange={(event) => setDraft({ ...draft, value: event.target.value })} autoComplete="off" />
          </Field>
          <Field label="Scope">
            <SelectInput value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as Scope })}>
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((item) => <option key={item} value={item}>{SCOPE_LABEL[item]}</option>)}
            </SelectInput>
          </Field>
          <label className="env-secret-toggle">
            <input type="checkbox" checked={draft.secret} onChange={(event) => setDraft({ ...draft, secret: event.target.checked })} />
            <span><strong>Treat as secret</strong><small>Masked in the interface and redacted from logs.</small></span>
          </label>
          {error ? <p className="field-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Add variable</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        title={removing ? `Remove ${removing.key}?` : "Remove variable?"}
        body="The running container keeps its current value until the next deploy."
        confirmLabel="Remove variable"
        danger
        onOpenChange={(open) => { if (!open) setRemoving(null) }}
        onConfirm={() => {
          if (!project || !removing) return
          const target = removing
          setRemoving(null)
          void save(project.env.filter((item) => item.id !== target.id), "Variable removed")
        }}
      />
    </div>
  )
}
