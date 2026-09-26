"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { EnvEditor, envError } from "@/components/projects/env-editor"
import { Button } from "@/components/ui/button"
import { copyText, EmptyState } from "@/components/ui/bits"
import { Field, SelectInput, TextInput } from "@/components/ui/fields"
import { ContainerStatusView, DomainStatusView, DeploymentStatusView } from "@/components/ui/status"
import { IconTile, ItemList, ItemRow, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag, deploymentTone } from "@/components/ui/kit"
import { ArrowUpRight, Boxes, Clock, Copy, Cpu, ExternalLink, GitBranch, Globe2, KeyRound, Lock, LockOpen, MemoryStick, Rocket } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { LogStream } from "@/components/logs/log-stream"
import { FRAMEWORKS, FRAMEWORK_ORDER } from "@/lib/deploy/detect"
import { formatDuration, formatRelative, formatUptime } from "@/lib/deploy/format"
import { deploymentsFor, liveDeployment, portTaken, projectEndpoint } from "@/lib/deploy/helpers"
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
  const toast = useToast()
  if (!state || !project) return null
  const history = deploymentsFor(state.deployments, project.id, now)
  const latest = history[0]
  const live = liveDeployment(state, project, now)
  const containers = state.containers.filter((item) => item.projectId === project.id)
  const web = containers.find((item) => item.role === "web")
  const endpoint = projectEndpoint(project, state.servers[0]?.ip)
  const server = state.servers.find((item) => item.id === web?.serverId) ?? state.servers[0]
  const domains = state.domains.filter((item) => item.projectId === project.id)
  const secrets = project.env.filter((item) => item.secret).length
  const ready = history.filter((item) => item.status === "ready").length
  const memoryPct = server && web ? (web.memoryMb / 1024 / server.memoryTotalGb) * 100 : 0
  const finished = history.filter((item) => item.finishedAt)
  const avgMs = finished.length ? finished.reduce((sum, item) => sum + (Date.parse(item.finishedAt!) - Date.parse(item.createdAt)), 0) / finished.length : 0

  return (
    <div className="page-stack">
      <StatGrid>
        <StatCard icon={Rocket} tone="brand" label="Releases" value={history.length} detail={`${ready} ready`} />
        <StatCard icon={Cpu} tone="info" label="CPU" value={<>{web ? web.cpuPercent : 0}<small>%</small></>} detail={web ? `${web.name}` : "No web container"} />
        <StatCard icon={MemoryStick} tone="neutral" label="Memory" value={<>{web ? web.memoryMb : 0}<small> MB</small></>} detail={server ? `of ${server.memoryTotalGb} GB on ${server.name}` : "—"} />
        <StatCard icon={Clock} tone="success" label="Uptime" value={formatUptime(web?.startedAt ?? null, now)} detail={avgMs ? `Average build ${formatDuration(avgMs)}` : "No finished builds"} />
      </StatGrid>

      <div className="project-grid">
        <section className="panel project-card">
          <div className="project-card-head">
            <IconTile icon={GitBranch} tone={latest ? deploymentTone(latest.status) : "neutral"} />
            <div className="min-w-0 flex-1"><h2>Latest deployment</h2><p>{latest ? formatRelative(latest.createdAt, now) : "Nothing deployed yet"}</p></div>
            {latest ? <DeploymentStatusView value={latest.status} /> : null}
          </div>
          {latest ? (
            <>
              <p className="project-commit">{latest.commitMessage || latest.sourceLabel}</p>
              <div className="project-chips">
                <code className="table-code">{latest.branch ?? "upload"}</code>
                <code className="table-code">{latest.commitSha}</code>
                <Tag><span className="capitalize">{latest.environment}</span></Tag>
                <span className="text-[11px] text-faint">by {latest.triggeredBy}</span>
              </div>
              <ol className="project-steps" aria-label="Pipeline steps">
                {latest.steps.map((step) => <li key={step.phase} data-status={step.status}><span aria-hidden />{step.label}</li>)}
              </ol>
              {live && live.id !== latest.id ? <p className="mt-3 text-xs text-muted">A previous release ({live.commitSha}) is still serving traffic.</p> : null}
              <div className="project-card-foot">
                <Link href={`/deployments/${latest.id}`} className="btn btn-secondary btn-sm">Open deployment<ArrowUpRight aria-hidden /></Link>
                <Link href={`/projects/${project.id}/logs`} className="btn btn-ghost btn-sm">Build logs</Link>
              </div>
            </>
          ) : <p className="mt-4 text-sm text-muted">Deploy the project to see its first release here.</p>}
        </section>

        <section className="panel project-card">
          <div className="project-card-head">
            <IconTile icon={Boxes} tone="brand" />
            <div className="min-w-0 flex-1"><h2>Runtime</h2><p>{containers.length} container{containers.length === 1 ? "" : "s"} on {server?.name ?? "—"}</p></div>
            {web ? <ContainerStatusView value={web.state} /> : null}
          </div>
          <dl className="server-resource-grid project-resources">
            <div className="resource-stat"><dt>CPU</dt><dd>{web ? `${web.cpuPercent}%` : "—"}</dd><SegmentMeter value={web?.cpuPercent ?? 0} label="CPU" /></div>
            <div className="resource-stat"><dt>Memory</dt><dd>{web ? `${web.memoryMb} MB` : "—"}</dd><SegmentMeter value={memoryPct} label="Memory" /></div>
          </dl>
          <dl className="project-facts">
            <div><dt>Framework</dt><dd>{FRAMEWORKS[project.framework].label}</dd></div>
            <div><dt>Ports</dt><dd><code className="table-code">{project.exposedPort} → {project.internalPort}</code></dd></div>
            <div><dt>Start</dt><dd><code className="table-code">{project.startCommand || "—"}</code></dd></div>
            <div><dt>Health check</dt><dd><code className="table-code">{project.healthPath}</code></dd></div>
            <div><dt>Restart</dt><dd>{project.restartPolicy}</dd></div>
          </dl>
        </section>

        <section className="panel project-card">
          <div className="project-card-head">
            <IconTile icon={Globe2} tone="info" />
            <div className="min-w-0 flex-1"><h2>Endpoints</h2><p>Where this project is reachable</p></div>
          </div>
          <div className="project-endpoint">
            <code>{endpoint}</code>
            <button type="button" className="icon-btn" aria-label="Copy endpoint" onClick={() => void copyText(endpoint).then((ok) => toast(ok ? { title: "Endpoint copied" } : { title: "Could not copy", tone: "danger" }))}><Copy aria-hidden /></button>
            <a className="icon-btn" href={endpoint} target="_blank" rel="noreferrer" aria-label="Open endpoint"><ExternalLink aria-hidden /></a>
          </div>
          <ul className="project-domain-list">
            {domains.map((domain) => <li key={domain.id}><span className="min-w-0 flex-1 truncate font-medium">{domain.name}</span><DomainStatusView value={domain.status} /></li>)}
            {domains.length === 0 ? <li className="text-muted">No hostnames yet.</li> : null}
          </ul>
          <div className="project-card-foot"><Link href={`/projects/${project.id}/domains`} className="btn btn-ghost btn-sm">Manage domains<ArrowUpRight aria-hidden /></Link></div>
        </section>

        <section className="panel project-card">
          <div className="project-card-head">
            <IconTile icon={KeyRound} tone="success" />
            <div className="min-w-0 flex-1"><h2>Environment</h2><p>{project.env.length} variables · {secrets} secret{secrets === 1 ? "" : "s"}</p></div>
          </div>
          <ul className="project-env-list">
            {project.env.slice(0, 4).map((variable) => <li key={variable.id}><span className="env-lock" data-secret={variable.secret}>{variable.secret ? <Lock aria-hidden /> : <LockOpen aria-hidden />}</span><code>{variable.key}</code><Tag>{variable.scope === "all" ? "Shared" : variable.scope}</Tag></li>)}
            {project.env.length === 0 ? <li className="text-muted">No variables yet.</li> : null}
          </ul>
          <div className="project-card-foot"><Link href={`/projects/${project.id}/environment`} className="btn btn-ghost btn-sm">Edit variables<ArrowUpRight aria-hidden /></Link></div>
        </section>
      </div>

      <section>
        <SectionHeading title="Recent releases" count={history.length} href={`/projects/${project.id}/deployments`} />
        <ItemList label="Recent releases">
          {history.slice(0, 5).map((deployment) => (
            <ItemRow
              key={deployment.id}
              href={`/deployments/${deployment.id}`}
              icon={GitBranch}
              tone={deploymentTone(deployment.status)}
              title={deployment.commitMessage || deployment.sourceLabel}
              subtitle={`${deployment.branch ?? "upload"} · ${deployment.commitSha} · ${formatRelative(deployment.createdAt, now)}`}
              meta={[<span key="d" className="text-faint">{deployment.finishedAt ? formatDuration(Date.parse(deployment.finishedAt) - Date.parse(deployment.createdAt)) : "In progress"}</span>]}
              metaWidths={[90]}
              trailing={<DeploymentStatusView value={deployment.status} />}
            />
          ))}
        </ItemList>
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
