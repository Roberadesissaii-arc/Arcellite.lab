"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, FileUp, FolderKanban, KeyRound, Layers, Lock, LockOpen, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { copyText, PageSkeleton } from "@/components/ui/bits"
import { Field, SelectInput, TextInput } from "@/components/ui/fields"
import { EmptyPanel, IconTile, SearchField, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { ConfirmDialog, Modal } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { envError } from "@/components/projects/env-editor"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import type { EnvironmentVariable } from "@/lib/deploy/types"
import { looksSecret, parseDotenv } from "@/lib/deploy/dotenv"
import { KeyGlyph } from "@/components/environment/key-glyph"

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

const PAGE_SIZE = 5

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
  const [page, setPage] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState<{ file: string; skipped: number[]; scope: Scope; rows: { key: string; value: string; secret: boolean; include: boolean }[] } | null>(null)

  const project = state?.projects.find((item) => item.id === picked) ?? state?.projects[0] ?? null
  const rows = useMemo(() => {
    if (!project) return []
    const q = search.trim().toLowerCase()
    return project.env.filter((item) => (scope === "any" || item.scope === scope) && (!q || item.key.toLowerCase().includes(q)))
  }, [project, scope, search])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  if (!state) return <PageSkeleton variant="detail" />
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
        actions={project ? (
          <>
            <input ref={fileRef} type="file" accept=".env,.txt,text/plain" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (!file) return
              void file.text().then((text) => {
                const parsed = parseDotenv(text)
                if (!parsed.entries.length) {
                  toast({ title: "Nothing to import", description: `${file.name} has no KEY=VALUE lines.` })
                  return
                }
                setError(null)
                setImporting({ file: file.name, skipped: parsed.skipped, scope: "all", rows: parsed.entries.map((entry) => ({ key: entry.key, value: entry.value, secret: looksSecret(entry.key), include: true })) })
              })
            }} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><FileUp aria-hidden />Upload .env</Button>
            <Button variant="primary" onClick={() => { setError(null); setDraft({ key: "", value: "", scope: "all", secret: true }); setAdding(true) }}><Plus aria-hidden />Add variable</Button>
          </>
        ) : null}
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
        <section>
        <SectionHeading title="Variables" aside={<span className="text-xs text-faint">Filters apply to the selected project</span>} />
        <div className="page-toolbar mb-3">
          <SearchField value={search} onChange={(value) => { setSearch(value); setPage(0) }} placeholder="Search keys" label="Search variables" />
          <div className="segmented" role="group" aria-label="Filter by scope">
            {SCOPES.map((item) => <button key={item.value} type="button" aria-pressed={scope === item.value} onClick={() => { setScope(item.value); setPage(0) }}>{item.label}</button>)}
          </div>
        </div>
        <div className="env-workbench">
          <aside className="env-rail">
            <p className="env-rail-label">Projects<span className="section-count">{state.projects.length}</span></p>
            <ul className="env-projects">
              {state.projects.map((item) => (
                <li key={item.id}>
                  <button type="button" className="pressable" aria-current={item.id === project?.id} onClick={() => { setPicked(item.id); setRevealed({}); setPage(0) }}>
                    <IconTile icon={FolderKanban} tone={item.id === project?.id ? "brand" : "neutral"} size="sm" />
                    <span className="min-w-0 flex-1"><strong>{item.name}</strong><small className="capitalize">{item.environment}</small></span>
                    <span className="section-count">{item.env.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="env-note">
              <ShieldCheck aria-hidden />
              <p><strong>How secrets are handled.</strong> Values are written to the container at start and never into the image or build log. In Phase 1 they are stored in this browser only.</p>
            </div>
          </aside>

          {project ? (
            <section className="env-pane">
              <header className="env-pane-head">
                <IconTile icon={FolderKanban} tone="brand" />
                <div className="min-w-0 flex-1">
                  <h2>{project.name}</h2>
                  <p><span className="capitalize">{project.environment}</span> · {project.env.length} variable{project.env.length === 1 ? "" : "s"} · {project.env.filter((item) => item.secret).length} secret</p>
                </div>
                <Link href={`/projects/${project.id}/environment`} className="env-pane-link">Project settings<ArrowUpRight size={13} aria-hidden /></Link>
              </header>
              {project.env.length ? (
                <ul className="env-scope-mix" aria-label="Variables by scope">
                  {(Object.keys(SCOPE_LABEL) as Scope[]).map((key) => {
                    const count = project.env.filter((item) => item.scope === key).length
                    return (
                      <li key={key} data-scope={key} data-empty={count === 0}>
                        <span className="env-scope-label"><i aria-hidden />{key === "all" ? "Shared" : SCOPE_LABEL[key]}</span>
                        <strong>{count}</strong>
                        <span className="env-scope-track" aria-hidden><span style={{ width: `${(count / project.env.length) * 100}%` }} /></span>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {rows.length === 0 ? (
                <div className="env-pane-empty">
                  <EmptyPanel icon={KeyRound} title={project.env.length ? "No variables match" : "No variables yet"} body={project.env.length ? "Try another scope or search." : "Add a variable to make it available to this project on its next deploy."} />
                </div>
              ) : (
                <div className="env-table" role="table" aria-label={`${project.name} variables`}>
                  <div className="env-row env-head" role="row">
                    <span role="columnheader">Key</span><span role="columnheader">Value</span><span role="columnheader">Scope</span><span role="columnheader" className="env-actions-head">Actions</span>
                  </div>
                  {visible.map((item) => {
                    const show = !item.secret || revealed[item.id]
                    return (
                      <div key={item.id} className="env-row" role="row">
                        <span role="cell" className="env-key">
                          <KeyGlyph name={item.key} secret={item.secret} />
                          <span className="min-w-0">
                            <code>{item.key}</code>
                            <small data-secret={item.secret}>{item.secret ? "Secret · masked" : `Plain text · ${item.value.length} chars`}</small>
                          </span>
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
              <div className="data-table-footer env-pane-foot">
                <p>{rows.length ? <>Showing <strong>{current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, rows.length)}</strong> of <strong>{rows.length}</strong> variables</> : "No variables to show"}</p>
                <div className="flex items-center gap-1">
                  <span className="mr-2 text-faint">Page {current + 1} of {pages}</span>
                  <button type="button" className="icon-btn pressable" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft aria-hidden /></button>
                  <button type="button" className="icon-btn pressable" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight aria-hidden /></button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
        </section>
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
      <Modal open={Boolean(importing)} onOpenChange={(open) => { if (!open) setImporting(null) }} title="Import variables" description={importing && project ? `${importing.file} → ${project.name}. Existing names in the same scope are updated.` : undefined} wide>
        {importing && project ? (() => {
          const chosen = importing.rows.filter((row) => row.include)
          const existing = new Set(project.env.filter((item) => item.scope === importing.scope).map((item) => item.key))
          const updates = chosen.filter((row) => existing.has(row.key)).length
          const setRow = (index: number, patch: Partial<(typeof importing.rows)[number]>) => setImporting({ ...importing, rows: importing.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) })
          return (
            <form className="env-import" onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              const incoming = new Map(chosen.map((row) => [row.key, row]))
              const kept = project.env.map((item) => {
                const row = item.scope === importing.scope ? incoming.get(item.key) : undefined
                if (!row) return item
                incoming.delete(item.key)
                return { ...item, value: row.value, secret: row.secret }
              })
              const added = [...incoming.values()].map((row) => ({ id: crypto.randomUUID(), key: row.key, value: row.value, scope: importing.scope, secret: row.secret }))
              void save([...kept, ...added], `Imported ${chosen.length} variable${chosen.length === 1 ? "" : "s"}`).then((ok) => { if (ok) setImporting(null) })
            }}>
              <div className="env-import-summary">
                <span className="env-import-file"><FileUp aria-hidden /><strong>{importing.file}</strong></span>
                <Tag tone="brand">{chosen.length - updates} new</Tag>
                {updates ? <Tag tone="warning">{updates} updated</Tag> : null}
                {importing.skipped.length ? <Tag>{importing.skipped.length} line{importing.skipped.length === 1 ? "" : "s"} skipped</Tag> : null}
                <div className="ml-auto w-44">
                  <SelectInput aria-label="Scope" value={importing.scope} onChange={(event) => setImporting({ ...importing, scope: event.target.value as Scope })}>
                    {(Object.keys(SCOPE_LABEL) as Scope[]).map((item) => <option key={item} value={item}>{SCOPE_LABEL[item]}</option>)}
                  </SelectInput>
                </div>
              </div>
              <ul className="env-import-list">
                {importing.rows.map((row, index) => (
                  <li key={row.key} data-off={!row.include}>
                    <input type="checkbox" checked={row.include} aria-label={`Import ${row.key}`} onChange={(event) => setRow(index, { include: event.target.checked })} />
                    <code className="env-import-key">{row.key}</code>
                    <span className="env-import-value">{row.secret ? mask(row.value) : row.value || <em>empty</em>}</span>
                    {existing.has(row.key) ? <Tag tone="warning">Update</Tag> : null}
                    <button type="button" className="env-import-secret" data-on={row.secret} onClick={() => setRow(index, { secret: !row.secret })} aria-pressed={row.secret}>
                      {row.secret ? <Lock aria-hidden /> : <LockOpen aria-hidden />}{row.secret ? "Secret" : "Plain"}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="env-import-note"><ShieldCheck aria-hidden />Names that look like credentials are marked secret. Values stay in this browser in Phase 1.</p>
              {error ? <p className="field-error">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setImporting(null)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={!chosen.length}>Import {chosen.length} variable{chosen.length === 1 ? "" : "s"}</Button>
              </div>
            </form>
          )
        })() : null}
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

