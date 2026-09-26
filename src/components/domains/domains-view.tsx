"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { CopyButton, EmptyState, PageSkeleton } from "@/components/ui/bits"
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

  return (
    <div className="page page-wide">
      <PageHeader
        title="Domains"
        description="Local endpoints stay reachable on the LAN. Public hostnames show the DNS and certificate steps without contacting a certificate authority."
        actions={<Button variant="primary" onClick={() => { setProjectId(state.projects[0]?.id ?? ""); setPort(String(state.projects[0]?.exposedPort ?? "")); setOpen(true) }}>Add domain</Button>}
      />
      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">Local endpoints</h2>
        <hr className="hairline my-3" />
        {state.projects.length === 0 ? <p className="text-sm text-muted">No projects are exposing a port.</p> : (
          <ul className="panel resource-list">
            {state.projects.map((project) => {
              const endpoint = projectEndpoint(project, state.servers[0]?.ip)
              return (
                <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block font-medium">{project.name}</span>
                    <span className="font-mono text-sm text-muted">{endpoint}</span>
                  </span>
                  <CopyButton value={endpoint} label="Copy" onCopied={(ok) => toast(ok ? { title: "Endpoint copied" } : { title: "Could not copy", tone: "danger" })} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <h2 className="text-[15px] font-semibold">Hostnames</h2>
        <hr className="hairline my-3" />
        {state.domains.length === 0 ? (
          <EmptyState title="No custom domains" body="Your applications can still be reached through their local endpoint." />
        ) : (
          <ul className="panel resource-list">
            {state.domains.map((domain) => {
              const project = state.projects.find((item) => item.id === domain.projectId)
              return (
                <li key={domain.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{domain.name}</p>
                      <p className="text-sm text-muted">{project?.name ?? "Unassigned"} · port {domain.targetPort} · {domain.kind === "private" ? "Private hostname" : "Public domain"} · added {formatRelative(domain.createdAt, now)}</p>
                    </div>
                    <DomainStatusView value={domain.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {domain.ssl === "simulated-active" ? "Simulated certificate. Phase 1 does not contact a certificate authority." : domain.ssl === "none" ? "No public certificate. This name is for the local network." : domain.ssl === "failed" ? "Certificate was not issued." : "Certificate has not been issued."}
                  </p>
                  {domain.error ? <p className="mt-2 text-sm text-[var(--status-danger)]">{domain.error}</p> : null}
                  {domain.records.length ? (
                    <ul className="mt-3 space-y-2">
                      {domain.records.map((record) => (
                        <li key={record.type + record.host} className="text-sm">
                          <span className="font-mono">{record.type} {record.host} → {record.value}</span>
                          <span className="block text-muted">{record.purpose}</span>
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
