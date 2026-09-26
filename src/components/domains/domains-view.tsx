"use client"

import { useState } from "react"
import { Clock, Globe2, Lock, Network, Plus, SearchX, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { CopyButton, PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, SearchField, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { Field, SelectInput, TextInput } from "@/components/ui/fields"
import { ConfirmDialog, Modal } from "@/components/ui/overlays"
import { DomainStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { formatRelative } from "@/lib/deploy/format"
import { projectEndpoint } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { DeployError } from "@/lib/deploy/types"
import { useNow } from "@/lib/use-now"

export function DomainsView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow(1000)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [name, setName] = useState("")
  const [projectId, setProjectId] = useState("")
  const [port, setPort] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [remove, setRemove] = useState<string | null>(null)
  if (!state) return <PageSkeleton variant="cards" />
  const selected = state.projects.find((project) => project.id === projectId) ?? state.projects[0]

  const q = search.trim().toLowerCase()
  const hostnames = state.domains.filter((domain) =>
    (kind === "all" || domain.kind === kind)
    && (statusFilter === "all" || (statusFilter === "active" ? domain.status === "active" : domain.status !== "active"))
    && (!q || domain.name.toLowerCase().includes(q)))
  const active = state.domains.filter((domain) => domain.status === "active").length
  const waiting = state.domains.filter((domain) => domain.status !== "active").length
  const openAdd = () => { setProjectId(state.projects[0]?.id ?? ""); setPort(String(state.projects[0]?.exposedPort ?? "")); setOpen(true) }

  return (
    <div className="page page-wide page-stack">
      <PageHeader
        icon={Globe2}
        kicker="Infrastructure"
        title="Domains"
        description="Local endpoints stay reachable on the LAN. Public hostnames show the DNS and certificate steps without contacting a certificate authority."
        actions={<Button variant="primary" onClick={openAdd}><Plus aria-hidden />Add domain</Button>}
      />
      <StatGrid>
        <StatCard icon={Network} tone="brand" label="Local endpoints" value={state.projects.length} detail="One per project" />
        <StatCard icon={Globe2} tone="info" label="Hostnames" value={state.domains.length} detail="Private and public" />
        <StatCard icon={ShieldCheck} tone="success" label="Active" value={active} detail="Resolving to a project" />
        <StatCard icon={Clock} tone={waiting ? "warning" : "neutral"} label="Need action" value={waiting} detail={waiting ? "DNS or verification pending" : "Nothing pending"} />
      </StatGrid>
      <section>
        <SectionHeading title="Local endpoints" count={state.projects.length} />
        {state.projects.length === 0 ? <EmptyPanel icon={Network} title="No endpoints" body="No projects are exposing a port." /> : (
          <div className="card-grid card-grid-3">
            {state.projects.map((project) => {
              const endpoint = projectEndpoint(project, state.servers[0]?.ip)
              return (
                <div key={project.id} className="card">
                  <div className="card-head">
                    <IconTile icon={Network} tone="brand" />
                    <div className="min-w-0"><p className="card-title">{project.name}</p><p className="card-sub">Port {project.exposedPort} → {project.internalPort}</p></div>
                    <CopyButton value={endpoint} label="Copy" onCopied={(ok) => toast(ok ? { title: "Endpoint copied" } : { title: "Could not copy", tone: "danger" })} />
                  </div>
                  <code className="code-chip">{endpoint}</code>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <section>
        <SectionHeading title="Hostnames" count={hostnames.length} aside={<Button variant="ghost" size="sm" onClick={openAdd}><Plus aria-hidden />Add</Button>} />
        <div className="page-toolbar mb-3">
          <SearchField value={search} onChange={setSearch} placeholder="Find a domain" label="Search domains" />
          <SelectInput aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">All kinds</option>
            <option value="private">Private (.local)</option>
            <option value="public">Public</option>
          </SelectInput>
          <SelectInput aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="attention">Needs action</option>
          </SelectInput>
        </div>
        {state.domains.length === 0 ? (
          <EmptyPanel icon={Globe2} title="No custom domains" body="Your applications can still be reached through their local endpoint." />
        ) : hostnames.length === 0 ? (
          <EmptyPanel icon={SearchX} title="No domains match" body="Try another name, kind, or status." />
        ) : (
          <ul className="space-y-4">
            {hostnames.map((domain) => {
              const project = state.projects.find((item) => item.id === domain.projectId)
              const tone = domain.status === "active" ? "success" : domain.status === "invalid" ? "danger" : domain.status === "verifying" || domain.status === "issuing" ? "info" : "warning"
              const steps = domain.kind === "public"
                ? [
                  { label: "DNS records", done: domain.status !== "dns-required" && domain.status !== "invalid" },
                  { label: "Verified", done: domain.status === "active" || domain.status === "issuing" },
                  { label: "Certificate", done: domain.ssl === "simulated-active" },
                  { label: "Serving", done: domain.status === "active" },
                ]
                : [
                  { label: "Name reserved", done: true },
                  { label: "LAN resolver", done: domain.status === "active" },
                  { label: "Serving", done: domain.status === "active" },
                ]
              return (
                <li key={domain.id} className="panel">
                  <div className="item-row">
                    <IconTile icon={domain.kind === "public" ? Globe2 : Network} tone={tone} size="lg" />
                    <span className="item-main">
                      <span className="item-title text-[15px]">{domain.name}</span>
                      <span className="item-subtitle">{project?.name ?? "Unassigned"} · port {domain.targetPort} · added {formatRelative(domain.createdAt, now)}</span>
                    </span>
                    <span className="item-meta"><Tag tone={domain.kind === "public" ? "brand" : "neutral"}>{domain.kind === "private" ? "Private" : domain.kind === "public" ? "Public" : "Local"}</Tag></span>
                    <span className="item-trailing"><DomainStatusView value={domain.status} /></span>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] px-[18px] py-5">
                    <ol className="domain-steps" aria-label="Setup progress">
                      {steps.map((step) => <li key={step.label} data-done={step.done}><span aria-hidden />{step.label}</li>)}
                    </ol>
                    <dl className="domain-facts">
                      <div><dt>Routes to</dt><dd>{project?.name ?? "—"} <span className="text-faint">:{domain.targetPort}</span></dd></div>
                      <div><dt>Certificate</dt><dd><Lock size={12} aria-hidden className="text-faint" />{domain.ssl === "simulated-active" ? "Simulated, active" : domain.ssl === "none" ? "Not needed on LAN" : domain.ssl === "failed" ? "Not issued" : "Pending"}</dd></div>
                      <div><dt>Verified</dt><dd>{domain.verifiedAt ? formatRelative(domain.verifiedAt, now) : "Not yet"}</dd></div>
                    </dl>
                    {domain.error ? <p className="mt-3 text-xs text-[var(--status-danger)]">{domain.error}</p> : null}
                    {domain.records.length ? (
                      <ul className="dns-records">
                        {domain.records.map((record) => (
                          <li key={record.type + record.host}>
                            <Tag tone="info">{record.type}</Tag>
                            <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[11.5px]">{record.host} → {record.value}</span><span className="block text-[11px] text-faint">{record.purpose}</span></span>
                            <CopyButton value={record.value} label="Copy" />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-4 flex gap-2">
                      {domain.kind === "public" && domain.status !== "active" ? (
                        <Button variant="primary" size="sm" onClick={() => void deploy.verifyDomain(domain.id).then(() => toast({ title: domain.status === "invalid" ? "Verification restarted" : "Verification started", description: domain.name }))}>
                          {domain.status === "invalid" ? "Verify again" : "Verify"}
                        </Button>
                      ) : null}
                      <Button variant="danger" size="sm" onClick={() => setRemove(domain.id)}>Remove</Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <Modal open={open} onOpenChange={setOpen} title="Add a domain" description="Enter a hostname, choose the project, and confirm the port it should reach.">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            const project = state.projects.find((item) => item.id === (projectId || selected?.id))
            if (!project) {
              setError("Choose a project.")
              return
            }
            void deploy.addDomain({ name, projectId: project.id, targetPort: Number(port || project.exposedPort) }).then(
              (domain) => {
                toast({ title: "Domain configured", description: domain.name })
                setOpen(false)
                setName("")
              },
              (reason: unknown) => {
                if (reason instanceof DeployError) setError(reason.detail)
              },
            )
          }}
        >
          <Field label="Domain" hint="Use a .local name for the LAN. Names ending in .invalid fail verification so the error state can be reviewed.">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="app.example.com" />
          </Field>
          <Field label="Project">
            <SelectInput value={projectId || selected?.id || ""} onChange={(event) => {
              setProjectId(event.target.value)
              const project = state.projects.find((item) => item.id === event.target.value)
              if (project) setPort(String(project.exposedPort))
            }}>
              {state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Target port">
            <TextInput value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" />
          </Field>
          {error ? <p className="field-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Add domain</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Remove this domain?"
        body="The hostname is detached in this demo. The local endpoint keeps working."
        confirmLabel="Remove domain"
        danger
        onOpenChange={(value) => { if (!value) setRemove(null) }}
        onConfirm={() => {
          if (!remove) return
          void deploy.deleteDomain(remove).then(() => {
            toast({ title: "Domain removed" })
            setRemove(null)
          })
        }}
      />
    </div>
  )
}
