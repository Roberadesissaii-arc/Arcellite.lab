"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  AlertTriangle, ArrowUpRight, Boxes, Check, Clock, Copy, Cpu, ExternalLink, GitBranch, GitCommitHorizontal, Globe2, HeartPulse,
  KeyRound, Lock, MemoryStick, Network, Plus, RefreshCw, Rocket, RotateCcw, Save, ShieldCheck, Terminal, Trash2, User, Wrench,
} from "lucide-react"
import { KeyGlyph } from "@/components/environment/key-glyph"
import { ProjectStatusCard } from "@/components/status/service-status"
import { EnvEditor, envError } from "@/components/projects/env-editor"
import { Button } from "@/components/ui/button"
import { copyText, EmptyState } from "@/components/ui/bits"
import { SelectInput, TextInput } from "@/components/ui/fields"
import { ConfirmDialog } from "@/components/ui/overlays"
import { ContainerStatusView, DomainStatusView, DeploymentStatusView } from "@/components/ui/status"
import { IconTile, SectionHeading, SegmentMeter, StatCard, StatGrid, Tag, deploymentTone } from "@/components/ui/kit"
import { useToast } from "@/components/ui/toast"
import { LogStream } from "@/components/logs/log-stream"
import { FRAMEWORKS, FRAMEWORK_ORDER } from "@/lib/deploy/detect"
import { formatDuration, formatRelative, formatUptime } from "@/lib/deploy/format"
import { portTaken, projectEndpoint } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState, useLiveDeployment, useProjectDeployments } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import type { Deployment, EnvironmentVariable, Framework, RestartPolicy } from "@/lib/deploy/types"
import { DeployError } from "@/lib/deploy/types"

function useProject() {
  const params = useParams<{ projectId: string }>()
  const state = useDeployState()
  const project = state?.projects.find((item) => item.id === params.projectId) ?? null
  return { state, project }
}

/** Staggered, critically damped entrance for blocks inside a tab. */
function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.42, delay: index * 0.05 }}
    >
      {children}
    </motion.div>
  )
}

function durationOf(deployment: Deployment): number | null {
  return deployment.finishedAt ? Date.parse(deployment.finishedAt) - Date.parse(deployment.createdAt) : null
}

const IN_FLIGHT = new Set(["queued", "preparing", "building", "deploying"])

/* ------------------------------------------------------------------ Overview */

export function ProjectOverview() {
  const { state, project } = useProject()
  const now = useNow()
  const toast = useToast()
  const history = useProjectDeployments(project?.id)
  const live = useLiveDeployment(project?.id)
  if (!state || !project) return null
  const latest = history[0]
  const containers = state.containers.filter((item) => item.projectId === project.id)
  const web = containers.find((item) => item.role === "web")
  const endpoint = projectEndpoint(project, state.servers[0]?.ip)
  const server = state.servers.find((item) => item.id === web?.serverId) ?? state.servers[0]
  const domains = state.domains.filter((item) => item.projectId === project.id)
  const secrets = project.env.filter((item) => item.secret).length
  const ready = history.filter((item) => item.status === "ready").length
  const memoryPct = server && web ? (web.memoryMb / 1024 / server.memoryTotalGb) * 100 : 0
  const finished = history.filter((item) => item.finishedAt)
  const avgMs = finished.length ? finished.reduce((sum, item) => sum + (durationOf(item) ?? 0), 0) / finished.length : 0
  const latestDuration = latest ? durationOf(latest) : null

  return (
    <div className="page-stack">
      <StatGrid>
        <StatCard icon={Rocket} tone="brand" label="Releases" value={history.length} detail={`${ready} ready`} href={`/projects/${project.id}/deployments`} />
        <StatCard icon={Cpu} tone="info" label="CPU" value={<>{web ? web.cpuPercent : 0}<small>%</small></>} detail={web ? `${web.name}` : "No web container"} />
        <StatCard icon={MemoryStick} tone="neutral" label="Memory" value={<>{web ? web.memoryMb : 0}<small> MB</small></>} detail={server ? `of ${server.memoryTotalGb} GB on ${server.name}` : "—"} />
        <StatCard icon={Clock} tone="success" label="Uptime" value={formatUptime(web?.startedAt ?? null, now)} detail={avgMs ? `Average build ${formatDuration(avgMs)}` : "No finished builds"} />
      </StatGrid>

      <Reveal><ProjectStatusCard project={project} /></Reveal>

      <div className="project-grid">
        <Reveal index={0} className="panel project-card">
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
              </div>
              <ol className="project-steps" aria-label="Pipeline steps">
                {latest.steps.map((step) => <li key={step.phase} data-status={step.status}><span aria-hidden />{step.label}</li>)}
              </ol>
              <dl className="project-release-facts">
                <div><dt><Clock aria-hidden />Build time</dt><dd>{latestDuration ? formatDuration(latestDuration) : "In progress"}</dd></div>
                <div><dt><User aria-hidden />Triggered by</dt><dd>{latest.triggeredBy}</dd></div>
                <div><dt><Rocket aria-hidden />Serving</dt><dd>{live ? <code className="table-code">{live.commitSha}</code> : "Nothing yet"}</dd></div>
              </dl>
              {live && live.id !== latest.id ? <p className="mt-3 text-xs text-muted">A previous release ({live.commitSha}) is still serving traffic.</p> : null}
              <div className="project-card-foot">
                <Link href={`/deployments/${latest.id}`} className="btn btn-secondary btn-sm">Open deployment<ArrowUpRight aria-hidden /></Link>
                <Link href={`/projects/${project.id}/logs`} className="btn btn-ghost btn-sm">Build logs</Link>
              </div>
            </>
          ) : <p className="mt-4 text-sm text-muted">Deploy the project to see its first release here.</p>}
        </Reveal>

        <Reveal index={1} className="panel project-card">
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
        </Reveal>

        <Reveal index={2} className="panel project-card">
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
        </Reveal>

        <Reveal index={3} className="panel project-card">
          <div className="project-card-head">
            <IconTile icon={KeyRound} tone="success" />
            <div className="min-w-0 flex-1"><h2>Environment</h2><p>{project.env.length} variable{project.env.length === 1 ? "" : "s"} · {secrets} secret{secrets === 1 ? "" : "s"}</p></div>
          </div>
          <ul className="project-env-list">
            {project.env.slice(0, 4).map((variable) => (
              <li key={variable.id}>
                <KeyGlyph name={variable.key} secret={variable.secret} />
                <code>{variable.key}</code>
                <Tag tone={variable.scope === "production" ? "brand" : variable.scope === "preview" ? "info" : variable.scope === "development" ? "warning" : "neutral"}>{variable.scope === "all" ? "Shared" : variable.scope}</Tag>
              </li>
            ))}
            {project.env.length === 0 ? <li className="text-muted">No variables yet.</li> : null}
          </ul>
          <div className="project-card-foot"><Link href={`/projects/${project.id}/environment`} className="btn btn-ghost btn-sm">Edit variables<ArrowUpRight aria-hidden /></Link></div>
        </Reveal>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- Deployments */

const DEPLOY_FILTERS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "active", label: "In progress" },
  { id: "failed", label: "Failed" },
] as const

export function ProjectDeployments() {
  const { state, project } = useProject()
  const deploy = useDeploy()
  const toast = useToast()
  const router = useRouter()
  const now = useNow()
  const reduced = useReducedMotion()
  const [filter, setFilter] = useState<(typeof DEPLOY_FILTERS)[number]["id"]>("all")
  const rows = useProjectDeployments(project?.id)
  const live = useLiveDeployment(project?.id)
  if (!state || !project) return null
  if (!rows.length) {
    return <EmptyState title="No deployments" body="Deploy the project to see releases here." />
  }
  const match = (item: Deployment) => filter === "all" || (filter === "active" ? IN_FLIGHT.has(item.status) : filter === "failed" ? item.status === "failed" || item.status === "canceled" : item.status === filter)
  const shown = rows.filter(match)
  const durations = rows.map(durationOf).filter((value): value is number => value !== null)
  const longest = Math.max(1, ...durations)
  const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0
  const ready = rows.filter((item) => item.status === "ready").length
  const rate = Math.round((ready / rows.length) * 100)
  const recent = [...rows].slice(0, 12).reverse()
  const counts = {
    all: rows.length,
    ready,
    active: rows.filter((item) => IN_FLIGHT.has(item.status)).length,
    failed: rows.filter((item) => item.status === "failed" || item.status === "canceled").length,
  }

  function redeploy() {
    void deploy.redeploy(project!.id).then(
      (deployment) => router.push(`/deployments/${deployment.id}`),
      (error: unknown) => {
        if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
      },
    )
  }

  return (
    <div className="page-stack">
      <Reveal className="panel pd-summary">
        <div className="pd-summary-cells">
          <div><span>Releases</span><strong>{rows.length}</strong><small>{counts.active ? `${counts.active} in progress` : "None in progress"}</small></div>
          <div>
            <span>Success rate</span>
            <strong className="pd-rate"><i style={{ "--pct": `${rate}%` } as React.CSSProperties} aria-hidden />{rate}<small>%</small></strong>
            <small>{ready} of {rows.length} ready</small>
          </div>
          <div><span>Average build</span><strong>{avg ? formatDuration(avg) : "—"}</strong><small>Longest {durations.length ? formatDuration(longest) : "—"}</small></div>
          <div><span>Serving now</span><strong className="pd-sha">{live ? live.commitSha : "—"}</strong><small>{live ? `Since ${formatRelative(live.finishedAt ?? live.createdAt, now)}` : "No live release"}</small></div>
        </div>
        <div className="pd-bars" role="img" aria-label="Build duration for recent releases, oldest first">
          {recent.map((item) => {
            const duration = durationOf(item)
            return (
              <motion.span
                key={item.id}
                data-status={item.status}
                title={`${item.commitSha} · ${duration ? formatDuration(duration) : item.status}`}
                initial={reduced ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                style={{ height: `${Math.max(12, ((duration ?? longest * 0.4) / longest) * 100)}%` }}
              />
            )
          })}
        </div>
      </Reveal>

      <div className="pd-toolbar">
        <div className="segmented" role="group" aria-label="Filter releases">
          {DEPLOY_FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}<span className="al-seg-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={redeploy}><RotateCcw aria-hidden />Redeploy latest</Button>
      </div>

      <ol className="pd-timeline">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((item, index) => {
            const duration = durationOf(item)
            const isLive = live?.id === item.id
            return (
              <motion.li
                key={item.id}
                layout={!reduced}
                data-status={item.status}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={reduced ? { duration: 0.12 } : { type: "spring", bounce: 0, duration: 0.4, delay: Math.min(index, 8) * 0.04 }}
              >
                <span className="pd-node" aria-hidden>
                  {item.status === "ready" ? <Check /> : item.status === "failed" || item.status === "canceled" ? <AlertTriangle /> : <RefreshCw className="pd-spin" />}
                </span>
                <Link href={`/deployments/${item.id}`} className="pd-card" data-live={isLive || undefined}>
                  <div className="pd-card-main">
                    <p className="pd-title">
                      <span className="truncate">{item.commitMessage || item.sourceLabel}</span>
                      {isLive ? <span className="pd-live"><i aria-hidden />Live</span> : null}
                    </p>
                    <p className="pd-meta">
                      <span><GitBranch aria-hidden />{item.branch ?? "upload"}</span>
                      <span><GitCommitHorizontal aria-hidden /><code>{item.commitSha}</code></span>
                      <span className="capitalize">{item.environment}</span>
                      <span><User aria-hidden />{item.triggeredBy}</span>
                      <span>{formatRelative(item.createdAt, now)}</span>
                    </p>
                    {item.error ? <p className="pd-error"><AlertTriangle aria-hidden />{item.error.title}</p> : null}
                  </div>
                  <div className="pd-card-side">
                    <DeploymentStatusView value={item.status} />
                    <span className="pd-duration">
                      <span className="pd-duration-bar" aria-hidden><motion.i initial={reduced ? false : { width: 0 }} animate={{ width: `${duration ? (duration / longest) * 100 : 35}%` }} transition={{ type: "spring", bounce: 0, duration: 0.6, delay: 0.1 }} /></span>
                      <small>{duration ? formatDuration(duration) : "Running…"}</small>
                    </span>
                  </div>
                  <ArrowUpRight aria-hidden className="pd-arrow" />
                </Link>
              </motion.li>
            )
          })}
        </AnimatePresence>
        {shown.length === 0 ? <li className="pd-empty">No {filter === "active" ? "releases in progress" : `${filter} releases`}.</li> : null}
      </ol>
    </div>
  )
}

/* ---------------------------------------------------------------------- Logs */

export function ProjectLogs() {
  const { project } = useProject()
  if (!project) return null
  return <Reveal><LogStream target="project" id={project.id} /></Reveal>
}

/* --------------------------------------------------------------- Environment */

export function ProjectEnvironment() {
  const { project } = useProject()
  const deploy = useDeploy()
  const toast = useToast()
  const reduced = useReducedMotion()
  const [draft, setDraft] = useState<EnvironmentVariable[] | null>(null)
  if (!project) return null
  const value = draft ?? project.env
  const dirty = draft !== null
  const secrets = value.filter((item) => item.secret).length

  function save() {
    const message = envError(value)
    if (message) {
      toast({ title: "Check the variables", description: message, tone: "danger" })
      return
    }
    void deploy.updateProject(project!.id, { env: value.filter((item) => item.key.trim()) }).then(
      () => {
        setDraft(null)
        toast({ title: "Environment variables saved", description: "Redeploy to apply them." })
      },
      (error: unknown) => {
        if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
      },
    )
  }

  return (
    <div className="pe-layout">
      <Reveal className="panel pe-main">
        <EnvEditor value={value} onChange={setDraft} title={`${project.name} variables`} />
      </Reveal>
      <Reveal index={1} className="pe-aside">
        <div className="panel pe-facts">
          <p className="pe-facts-title"><ShieldCheck aria-hidden />At a glance</p>
          <dl>
            <div><dt>Variables</dt><dd>{value.filter((item) => item.key.trim()).length}</dd></div>
            <div><dt>Secrets</dt><dd>{secrets}</dd></div>
            <div><dt>Production only</dt><dd>{value.filter((item) => item.scope === "production").length}</dd></div>
            <div><dt>Shared</dt><dd>{value.filter((item) => item.scope === "all").length}</dd></div>
          </dl>
        </div>
        <div className="panel pe-tips">
          <p className="pe-facts-title"><Lock aria-hidden />How values are used</p>
          <ul>
            <li><Check aria-hidden />Written into the container when it starts.</li>
            <li><Check aria-hidden />Never baked into the image or the build log.</li>
            <li><Check aria-hidden />Changes apply on the next deploy.</li>
          </ul>
          <Link href="/environment" className="al-routes-link">All projects’ variables<ArrowUpRight aria-hidden /></Link>
        </div>
      </Reveal>
      <AnimatePresence>
        {dirty ? (
          <motion.div
            className="pe-savebar"
            role="status"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ type: "spring", bounce: 0, duration: 0.34 }}
          >
            <span className="pe-savebar-dot" aria-hidden />
            <span className="flex-1">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Discard</Button>
            <Button variant="primary" size="sm" onClick={save}><Save aria-hidden />Save variables</Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------- Domains */

export function ProjectDomains() {
  const { state, project } = useProject()
  const deploy = useDeploy()
  const toast = useToast()
  const now = useNow()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  if (!state || !project) return null
  const domains = state.domains.filter((domain) => domain.projectId === project.id)
  const endpoint = projectEndpoint(project, state.servers[0]?.ip)
  const target = domains.find((domain) => domain.id === removing)

  function add(event: React.FormEvent) {
    event.preventDefault()
    const hostname = name.trim().toLowerCase()
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(hostname)) {
      setError("Enter a hostname like app.example.com or app.local.")
      return
    }
    setError(null)
    void deploy.addDomain({ name: hostname, projectId: project!.id, targetPort: project!.exposedPort }).then(
      () => {
        setName("")
        toast({ title: "Hostname added", description: hostname })
      },
      (reason: unknown) => setError(reason instanceof DeployError ? reason.detail || reason.title : "Could not add the hostname."),
    )
  }

  return (
    <div className="page-stack">
      <Reveal className="pdm-endpoint">
        <span className="pdm-endpoint-icon"><Network aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="pdm-endpoint-label">Local endpoint · always on</p>
          <code>{endpoint}</code>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyText(endpoint).then((ok) => toast(ok ? { title: "Endpoint copied" } : { title: "Could not copy", tone: "danger" }))}><Copy aria-hidden />Copy</button>
        <a className="btn btn-primary btn-sm" href={endpoint} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Open</a>
      </Reveal>

      <Reveal index={1}>
        <form className="pdm-add" onSubmit={add}>
          <Globe2 aria-hidden />
          <input value={name} onChange={(event) => { setName(event.target.value); setError(null) }} placeholder="Add a hostname — app.example.com or app.local" aria-label="Hostname" autoComplete="off" spellCheck={false} />
          <span className="pdm-port">→ :{project.exposedPort}</span>
          <Button type="submit" variant="primary" size="sm"><Plus aria-hidden />Add</Button>
        </form>
        {error ? <p className="field-error mt-2">{error}</p> : null}
      </Reveal>

      <section>
        <SectionHeading title="Hostnames" count={domains.length} href="/domains" action="DNS details" />
        {domains.length === 0 ? (
          <Reveal index={2} className="pdm-empty">
            <IconTile icon={Globe2} tone="brand" size="lg" />
            <strong>No hostnames yet</strong>
            <small>.local names work on your network right away. Public names need a DNS record.</small>
          </Reveal>
        ) : (
          <ul className="pdm-list">
            <AnimatePresence initial={false}>
              {domains.map((domain, index) => {
                const steps = domain.kind === "public" ? ["DNS", "Verified", "Certificate", "Serving"] : ["Reserved", "Resolver", "Serving"]
                const done = domain.status === "active" ? steps.length : domain.status === "issuing" ? 2 : domain.status === "verifying" ? 1 : 0
                return (
                  <motion.li
                    key={domain.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.38, delay: index * 0.04 }}
                    className="pdm-card"
                  >
                    <div className="pdm-card-head">
                      <IconTile icon={domain.kind === "public" ? Globe2 : Network} tone={domain.status === "active" ? "success" : domain.status === "invalid" ? "danger" : "warning"} />
                      <div className="min-w-0 flex-1">
                        <p className="pdm-name">{domain.name}</p>
                        <p className="pdm-sub"><span className="capitalize">{domain.kind}</span> · port {domain.targetPort} · added {formatRelative(domain.createdAt, now)}</p>
                      </div>
                      <DomainStatusView value={domain.status} />
                    </div>
                    <ol className="pdm-steps" aria-label="Setup progress">
                      {steps.map((step, stepIndex) => (
                        <li key={step} data-done={stepIndex < done} data-current={stepIndex === done}>
                          <span aria-hidden>{stepIndex < done ? <Check /> : stepIndex + 1}</span>{step}
                        </li>
                      ))}
                    </ol>
                    <div className="pdm-card-foot">
                      {domain.kind === "public" && domain.status !== "active" ? (
                        <Button variant="secondary" size="sm" onClick={() => void deploy.verifyDomain(domain.id).then(() => toast({ title: "Verification started", description: domain.name }))}><RefreshCw aria-hidden />Verify</Button>
                      ) : null}
                      <Link href="/domains" className="btn btn-ghost btn-sm">DNS records<ArrowUpRight aria-hidden /></Link>
                      <button type="button" className="btn btn-ghost btn-sm pdm-remove" onClick={() => setRemoving(domain.id)}><Trash2 aria-hidden />Remove</button>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(target)}
        title={target ? `Remove ${target.name}?` : "Remove hostname?"}
        body="The local endpoint keeps working. You can add the hostname again later."
        confirmLabel="Remove hostname"
        danger
        onOpenChange={(open) => { if (!open) setRemoving(null) }}
        onConfirm={() => {
          if (!target) return
          setRemoving(null)
          void deploy.deleteDomain(target.id).then(() => toast({ title: "Hostname removed", description: target.name }))
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ Settings */

export function ProjectSettings() {
  const { state, project } = useProject()
  if (!state || !project) return null
  return <ProjectSettingsForm key={project.id} />
}

const SETTINGS_SECTIONS = [
  { id: "general", label: "General", icon: Wrench },
  { id: "build", label: "Build & run", icon: Terminal },
  { id: "network", label: "Networking", icon: Network },
  { id: "runtime", label: "Runtime", icon: HeartPulse },
  { id: "danger", label: "Danger zone", icon: AlertTriangle },
] as const

const RESTART_OPTIONS: { value: RestartPolicy; label: string; body: string }[] = [
  { value: "unless-stopped", label: "Unless stopped", body: "Restart unless you stopped it." },
  { value: "on-failure", label: "On failure", body: "Restart only after a crash." },
  { value: "always", label: "Always", body: "Restart no matter what." },
  { value: "no", label: "Never", body: "Stay down after exit." },
]

function ProjectSettingsForm() {
  const { state, project } = useProject()
  const deploy = useDeploy()
  const toast = useToast()
  const router = useRouter()
  const reduced = useReducedMotion()
  const initial = {
    name: project?.name ?? "",
    branch: project?.branch ?? "",
    build: project?.buildCommand ?? "",
    start: project?.startCommand ?? "",
    install: project?.installCommand ?? "",
    framework: (project?.framework ?? "nextjs") as Framework,
    port: String(project?.exposedPort ?? ""),
    health: project?.healthPath ?? "/",
    restart: (project?.restartPolicy ?? "unless-stopped") as RestartPolicy,
    failure: project?.simulateFailure ?? false,
    auto: project?.autoDeploy ?? false,
  }
  const [form, setForm] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [remove, setRemove] = useState(false)
  if (!state || !project) return null
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))
  // Failure simulation is a mock dev tool; a provider without `dev` never shows it.
  const dev = deploy.dev
  const showFailure = Boolean(dev) && (project.id === "proj_api" || state.settings.developerMode || project.simulateFailure)
  const portClash = form.port !== String(project.exposedPort) && portTaken(state.projects, Number(form.port), project.id)

  function save() {
    const exposed = Number(form.port)
    if (!Number.isInteger(exposed) || exposed < 1 || exposed > 65535) {
      toast({ title: "Check the host port", description: "Use a number between 1 and 65535.", tone: "danger" })
      return
    }
    if (portTaken(state!.projects, exposed, project!.id)) {
      toast({ title: "Port unavailable", description: `${exposed} is already assigned.`, tone: "danger" })
      return
    }
    void deploy.updateProject(project!.id, {
      name: form.name,
      branch: form.branch || null,
      buildCommand: form.build,
      startCommand: form.start,
      installCommand: form.install,
      framework: form.framework,
      exposedPort: exposed,
      portMode: "custom",
      healthPath: form.health,
      restartPolicy: form.restart,
      autoDeploy: form.auto,
    }).then(() => (dev && form.failure !== project!.simulateFailure ? dev.setSimulateFailure(project!.id, form.failure) : undefined)).then(
      () => {
        setSaved(form)
        toast({ title: "Project settings saved", description: "They apply on the next deploy." })
      },
      (error: unknown) => {
        if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
      },
    )
  }

  return (
    <div className="ps-layout">
      <nav className="ps-nav" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon
          return <a key={section.id} href={`#ps-${section.id}`} data-danger={section.id === "danger" || undefined}><Icon aria-hidden />{section.label}</a>
        })}
      </nav>
      <form className="ps-groups" onSubmit={(event) => { event.preventDefault(); save() }}>
        <Reveal index={0}>
          <section id="ps-general" className="setting-group ps-group">
            <h3>General</h3>
            <div className="setting-rows">
              <SettingField label="Project name" hint="Shown across the dashboard and in notifications."><TextInput value={form.name} onChange={(event) => set("name", event.target.value)} /></SettingField>
              <SettingField label="Framework" hint="Sets sensible build and start defaults.">
                <SelectInput value={form.framework} onChange={(event) => set("framework", event.target.value as Framework)}>
                  {FRAMEWORK_ORDER.map((item) => <option key={item} value={item}>{FRAMEWORKS[item].label}</option>)}
                </SelectInput>
              </SettingField>
              <SettingField label="Branch" hint="Deploys come from this branch."><div className="ps-affix"><GitBranch aria-hidden /><TextInput value={form.branch} onChange={(event) => set("branch", event.target.value)} placeholder="main" /></div></SettingField>
              <SettingField label="Deploy on push" hint="Start a release whenever the branch changes."><Switch label="Deploy on push" checked={form.auto} onChange={(value) => set("auto", value)} /></SettingField>
            </div>
          </section>
        </Reveal>

        <Reveal index={1}>
          <section id="ps-build" className="setting-group ps-group">
            <h3>Build & run</h3>
            <div className="ps-commands">
              {([["install", "Install", "pnpm install"], ["build", "Build", "pnpm build"], ["start", "Start", "pnpm start"]] as const).map(([key, label, placeholder], index) => (
                <label key={key} className="ps-command">
                  <span className="ps-command-step">{index + 1}</span>
                  <span className="ps-command-label">{label}</span>
                  <span className="ps-command-input"><span aria-hidden>$</span><input value={form[key]} onChange={(event) => set(key, event.target.value)} placeholder={placeholder} spellCheck={false} /></span>
                </label>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal index={2}>
          <section id="ps-network" className="setting-group ps-group">
            <h3>Networking</h3>
            <div className="setting-rows">
              <SettingField label="Host port" hint={portClash ? "Another project already uses this port." : `Container listens on ${project.internalPort}.`}>
                <div className="ps-affix" data-error={portClash || undefined}><span className="ps-affix-text">:</span><TextInput value={form.port} inputMode="numeric" onChange={(event) => set("port", event.target.value.replace(/[^0-9]/g, ""))} /></div>
              </SettingField>
              <SettingField label="Health endpoint" hint="Must answer 200 before traffic switches."><div className="ps-affix"><HeartPulse aria-hidden /><TextInput value={form.health} onChange={(event) => set("health", event.target.value)} /></div></SettingField>
            </div>
          </section>
        </Reveal>

        <Reveal index={3}>
          <section id="ps-runtime" className="setting-group ps-group">
            <h3>Runtime</h3>
            <div className="ps-restart" role="radiogroup" aria-label="Restart policy">
              {RESTART_OPTIONS.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={form.restart === option.value} className="choice-card pressable" onClick={() => set("restart", option.value)}>
                  <strong>{option.label}</strong><small>{option.body}</small>
                </button>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal index={4}>
          <section id="ps-danger" className="setting-group ps-group ps-danger">
            <h3>Danger zone</h3>
            <div className="setting-rows">
              {showFailure ? (
                <SettingField label="Simulate a failed build" hint="The next deployment fails at the build step. For testing alerts."><Switch label="Simulate a failed build" checked={form.failure} onChange={(value) => set("failure", value)} /></SettingField>
              ) : null}
              <SettingField label="Delete project" hint="Removes it from the control plane. Phase 1 does not stop a real container.">
                <Button type="button" variant="danger" size="sm" onClick={() => setRemove(true)}><Trash2 aria-hidden />Delete project</Button>
              </SettingField>
            </div>
          </section>
        </Reveal>

        <AnimatePresence>
          {dirty ? (
            <motion.div
              className="pe-savebar"
              role="status"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
              transition={{ type: "spring", bounce: 0, duration: 0.34 }}
            >
              <span className="pe-savebar-dot" aria-hidden />
              <span className="flex-1">Unsaved changes</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(saved)}>Discard</Button>
              <Button type="submit" variant="primary" size="sm"><Save aria-hidden />Save settings</Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>
      <ConfirmDialog
        open={remove}
        title={`Delete ${project.name}?`}
        body="This removes the project from the control plane. Phase 1 does not stop a real container."
        confirmLabel="Delete project"
        danger
        onOpenChange={setRemove}
        onConfirm={() => {
          void deploy.deleteProject(project.id).then(() => {
            toast({ title: "Project deleted", description: project.name })
            router.push("/projects")
          })
        }}
      />
    </div>
  )
}

function SettingField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="min-w-0"><p className="setting-label">{label}</p>{hint ? <p className="setting-hint">{hint}</p> : null}</div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle pressable" onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}
