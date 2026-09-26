"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { EnvEditor, envError } from "@/components/projects/env-editor"
import { Button } from "@/components/ui/button"
import { CopyButton, EmptyState } from "@/components/ui/bits"
import { Field, SelectInput, TextInput } from "@/components/ui/fields"
import { DomainStatusView, DeploymentStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { LogStream } from "@/components/logs/log-stream"
import { FRAMEWORKS, FRAMEWORK_ORDER } from "@/lib/deploy/detect"
import { formatDuration, formatRelative, formatUptime } from "@/lib/deploy/format"
import { deploymentsFor, liveDeployment, portTaken, projectEndpoint, sourceText } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import type { EnvironmentVariable, Framework, RestartPolicy } from "@/lib/deploy/types"
import { DeployError } from "@/lib/deploy/types"

function useProject() {
  const params = useParams<{ projectId: string }>()
  const state = useDeployState()
  const project = state?.projects.find((item) => item.id === params.projectId) ?? null
  return { state, project }
}

export function ProjectOverview() {
  const { state, project } = useProject()
  const now = useNow()
  if (!state || !project) return null
  const latest = deploymentsFor(state.deployments, project.id, now)[0]
  const live = liveDeployment(state, project, now)
  const container = state.containers.find((item) => item.projectId === project.id && item.role === "web")
  const endpoint = projectEndpoint(project, state.servers[0]?.ip)
  const server = state.servers[0]
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel p-5">
        <h2 className="text-[15px] font-semibold">Production deployment</h2>
        <hr className="hairline my-3" />
        {latest ? (
          <>
            <DeploymentStatusView value={latest.status} />
            <p className="mt-4 font-mono text-sm">{latest.branch ?? "no branch"} · {latest.commitSha}</p>
            <p className="mt-1 text-sm">{latest.commitMessage}</p>
            <p className="mt-2 text-sm text-muted">{formatRelative(latest.createdAt, now)}</p>
            <Link href={`/deployments/${latest.id}`} className="mt-4 inline-block text-sm text-muted underline underline-offset-4">
              Open deployment
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted">No deployment yet.</p>
        )}
        {live && latest && live.id !== latest.id ? (
          <p className="mt-4 text-sm text-muted">A previous release is still the one being served.</p>
        ) : null}
      </section>
      <section className="panel p-5">
        <h2 className="text-[15px] font-semibold">Runtime</h2>
        <hr className="hairline my-3" />
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Framework</dt>
          <dd>{FRAMEWORKS[project.framework].label}</dd>
          <dt className="text-muted">Port</dt>
          <dd>{project.internalPort} → {project.exposedPort}</dd>
          <dt className="text-muted">Memory</dt>
          <dd>{container ? `${container.memoryMb} MB` : "—"}</dd>
          <dt className="text-muted">CPU</dt>
          <dd>{container ? `${container.cpuPercent}%` : "—"}</dd>
          <dt className="text-muted">Uptime</dt>
          <dd>{formatUptime(container?.startedAt ?? null, now)}</dd>
          <dt className="text-muted">Source</dt>
          <dd>{sourceText(project)}</dd>
        </dl>
      </section>
      <section className="panel p-5 lg:col-span-2">
        <h2 className="text-[15px] font-semibold">Endpoint</h2>
        <hr className="hairline my-3" />
        <p className="font-mono text-sm">{endpoint}</p>
        <p className="mt-2 text-sm text-muted">
          Local endpoint on {server?.name ?? "this server"}. {project.hostname} is a private hostname for the LAN.
        </p>
        <div className="mt-3 flex gap-2">
          <CopyButton value={endpoint} label="Copy" onCopied={(ok) => ok} />
          <a className="btn btn-secondary" href={endpoint} target="_blank" rel="noreferrer">Open</a>
          <Link className="btn btn-ghost" href={`/projects/${project.id}/domains`}>Configure domain</Link>
        </div>
      </section>
    </div>
  )
}

export function ProjectDeployments() {
  const { state, project } = useProject()
  const now = useNow()
  if (!state || !project) return null
  const rows = deploymentsFor(state.deployments, project.id, now)
  if (!rows.length) return <EmptyState title="No deployments" body="Deploy the project to see releases here." />
  return (
    <ul className="panel resource-list">
      {rows.map((deployment) => (
        <li key={deployment.id}>
          <Link href={`/deployments/${deployment.id}`} className="data-row md:grid-cols-[140px_1fr_120px_100px]">
            <DeploymentStatusView value={deployment.status} />
            <span>
              <span className="block font-medium">{deployment.commitMessage}</span>
              <span className="font-mono text-xs text-muted">{deployment.commitSha}</span>
            </span>
            <span className="text-sm text-muted">{deployment.finishedAt ? formatDuration(Date.parse(deployment.finishedAt) - Date.parse(deployment.createdAt)) : "In progress"}</span>
            <span className="text-sm text-faint">{formatRelative(deployment.createdAt, now)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ProjectLogs() {
  const { project } = useProject()
  if (!project) return null
  return <LogStream target="project" id={project.id} />
}

export function ProjectEnvironment() {
  const { project } = useProject()
  const deploy = useDeploy()
  const toast = useToast()
  const [draft, setDraft] = useState<EnvironmentVariable[] | null>(null)
  if (!project) return null
  const value = draft ?? project.env
  return (
    <div>
      <EnvEditor value={value} onChange={setDraft} />
      <div className="mt-6">
        <Button
          variant="primary"
          onClick={() => {
            const message = envError(value)
            if (message) {
              toast({ title: "Check the variables", description: message, tone: "danger" })
              return
            }
            void deploy.updateProject(project.id, { env: value.filter((item) => item.key.trim()) }).then(
              () => {
                setDraft(null)
                toast({ title: "Environment variables saved" })
              },
              (error: unknown) => {
                if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
              },
            )
          }}
        >
          Save variables
        </Button>
      </div>
    </div>
  )
}

export function ProjectDomains() {
  const { state, project } = useProject()
  if (!state || !project) return null
  const domains = state.domains.filter((domain) => domain.projectId === project.id)
  return (
    <div>
      <p className="text-sm text-muted">Local endpoint {projectEndpoint(project, state.servers[0]?.ip)} stays available even without a custom domain.</p>
      {domains.length === 0 ? (
        <EmptyState title="No hostnames" body="Add a private or public hostname from the Domains page." action={<Link className="btn btn-primary" href="/domains">Add domain</Link>} />
      ) : (
        <ul className="mt-4">
          {domains.map((domain) => (
            <li key={domain.id} className="data-row md:grid-cols-[1fr_120px_160px]">
              <span className="font-medium">{domain.name}</span>
              <span className="text-sm capitalize text-muted">{domain.kind}</span>
              <DomainStatusView value={domain.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ProjectSettings() {
  const { state, project } = useProject()
  if (!state || !project) return null
  return <ProjectSettingsForm key={project.id} />
}

function ProjectSettingsForm() {
  const { state, project } = useProject()
  const deploy = useDeploy()
  const toast = useToast()
  const router = useRouter()
  const [name, setName] = useState(project?.name ?? "")
  const [branch, setBranch] = useState(project?.branch ?? "")
  const [build, setBuild] = useState(project?.buildCommand ?? "")
  const [start, setStart] = useState(project?.startCommand ?? "")
  const [install, setInstall] = useState(project?.installCommand ?? "")
  const [framework, setFramework] = useState<Framework>(project?.framework ?? "nextjs")
  const [port, setPort] = useState(String(project?.exposedPort ?? ""))
  const [health, setHealth] = useState(project?.healthPath ?? "/")
  const [restart, setRestart] = useState<RestartPolicy>(project?.restartPolicy ?? "unless-stopped")
  const [failure, setFailure] = useState(project?.simulateFailure ?? false)
  const [auto, setAuto] = useState(project?.autoDeploy ?? false)
  if (!state || !project) return null
  const showFailure = project.id === "proj_api" || state.settings.developerMode || project.simulateFailure
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const exposed = Number(port)
        if (portTaken(state.projects, exposed, project.id)) {
          toast({ title: "Port unavailable", description: `${exposed} is already assigned.`, tone: "danger" })
          return
        }
        void deploy.updateProject(project.id, {
          name,
          branch: branch || null,
          buildCommand: build,
          startCommand: start,
          installCommand: install,
          framework,
          exposedPort: exposed,
          portMode: "custom",
          healthPath: health,
          restartPolicy: restart,
          simulateFailure: failure,
          autoDeploy: auto,
        }).then(
          () => toast({ title: "Project settings saved" }),
          (error: unknown) => {
            if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
          },
        )
      }}
    >
      <Field label="Name"><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Branch"><TextInput value={branch} onChange={(event) => setBranch(event.target.value)} /></Field>
      <Field label="Framework">
        <SelectInput value={framework} onChange={(event) => setFramework(event.target.value as Framework)}>
          {FRAMEWORK_ORDER.map((item) => <option key={item} value={item}>{FRAMEWORKS[item].label}</option>)}
        </SelectInput>
      </Field>
      <Field label="Install command"><TextInput value={install} onChange={(event) => setInstall(event.target.value)} /></Field>
      <Field label="Build command"><TextInput value={build} onChange={(event) => setBuild(event.target.value)} /></Field>
      <Field label="Start command"><TextInput value={start} onChange={(event) => setStart(event.target.value)} /></Field>
      <Field label="Host port"><TextInput value={port} onChange={(event) => setPort(event.target.value)} /></Field>
      <Field label="Health endpoint"><TextInput value={health} onChange={(event) => setHealth(event.target.value)} /></Field>
      <Field label="Restart policy">
        <SelectInput value={restart} onChange={(event) => setRestart(event.target.value as RestartPolicy)}>
          <option value="unless-stopped">unless-stopped</option>
          <option value="on-failure">on-failure</option>
          <option value="always">always</option>
          <option value="no">no</option>
        </SelectInput>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />
        Auto deploy
      </label>
      {showFailure ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={failure} onChange={(event) => setFailure(event.target.checked)} />
          Simulate a failed build on the next deployment
        </label>
      ) : null}
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary">Save settings</Button>
        <Button type="button" variant="danger" onClick={() => router.push(`/projects/${project.id}`)}>
          Done
        </Button>
      </div>
    </form>
  )
}
