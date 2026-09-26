"use client"

import { useState } from "react"
import { Clock, Globe2, Lock, Network, Plus, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { CopyButton, PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, IconTile, ItemList, ItemRow, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
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
  const [name, setName] = useState("")
  const [projectId, setProjectId] = useState("")
  const [port, setPort] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [remove, setRemove] = useState<string | null>(null)
  if (!state) return <PageSkeleton />
  const selected = state.projects.find((project) => project.id === projectId) ?? state.projects[0]

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
        <SectionHeading title="Hostnames" count={state.domains.length} aside={<Button variant="ghost" size="sm" onClick={openAdd}><Plus aria-hidden />Add</Button>} />
        {state.domains.length === 0 ? (
          <EmptyPanel icon={Globe2} title="No custom domains" body="Your applications can still be reached through their local endpoint." />
        ) : (
          <ItemList label="Hostnames">
            {state.domains.map((domain) => {
              const project = state.projects.find((item) => item.id === domain.projectId)
              return (
                <ItemRow
                  key={domain.id}
                  icon={domain.kind === "public" ? Globe2 : Network}
                  tone={domain.status === "active" ? "success" : domain.status === "invalid" ? "danger" : domain.status === "verifying" || domain.status === "issuing" ? "info" : "warning"}
                  title={domain.name}
                  subtitle={`${project?.name ?? "Unassigned"} · port ${domain.targetPort} · added ${formatRelative(domain.createdAt, now)}`}
                  meta={[<Tag key="k" tone={domain.kind === "public" ? "brand" : "neutral"}>{domain.kind === "private" ? "Private" : domain.kind === "public" ? "Public" : "Local"}</Tag>]}
                  metaWidths={[80]}
                  trailing={<DomainStatusView value={domain.status} />}
                >
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <Lock size={13} aria-hidden className="text-faint" />
                    {domain.ssl === "simulated-active" ? "Simulated certificate. Phase 1 does not contact a certificate authority." : domain.ssl === "none" ? "No public certificate. This name is for the local network." : domain.ssl === "failed" ? "Certificate was not issued." : "Certificate has not been issued."}
                  </p>
                  {domain.error ? <p className="mt-2 text-xs text-[var(--status-danger)]">{domain.error}</p> : null}
                  {domain.records.length ? (
                    <ul className="dns-records">
                      {domain.records.map((record) => (
                        <li key={record.type + record.host}>
                          <Tag tone="info">{record.type}</Tag>
                          <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[11.5px]">{record.host} → {record.value}</span><span className="block text-[11px] text-faint">{record.purpose}</span></span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    {domain.kind === "public" && domain.status !== "active" ? (
                      <Button variant="primary" size="sm" onClick={() => void deploy.verifyDomain(domain.id).then(() => toast({ title: domain.status === "invalid" ? "Verification restarted" : "Verification started", description: domain.name }))}>
                        {domain.status === "invalid" ? "Verify again" : "Verify"}
                      </Button>
                    ) : null}
                    <Button variant="danger" size="sm" onClick={() => setRemove(domain.id)}>Remove</Button>
                  </div>
                </ItemRow>
              )
            })}
          </ItemList>
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
