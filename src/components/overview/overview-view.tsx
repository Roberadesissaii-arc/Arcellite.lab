"use client"

import Link from "next/link"
import { ArrowRight, Check, CircleAlert, Code2, Server, Zap, GitBranch, ArrowUpRight, Plus } from "lucide-react"
import { DeploymentStatusView, ServerStatusView, Status } from "@/components/ui/status"
import { BoxesIcon, EarthIcon, FolderKanbanIcon, GitBranchIcon, SparklesIcon } from "lucide-animated"
import { type AnimatedIcon, useIconAnimation } from "@/components/ui/animated-icon"
import { PageSkeleton } from "@/components/ui/bits"
import { FRAMEWORKS } from "@/lib/deploy/detect"
import { formatGb, formatRelative, formatUptime, greeting } from "@/lib/deploy/format"
import { ReleaseChart } from "@/components/overview/release-chart"
import { homeServer, projectBadge, sourceText } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

function SectionHeading({ title, href, action = "View all" }: { title: string; href: string; action?: string }) {
  return <div className="section-heading"><h2>{title}</h2><Link href={href}>{action}<ArrowRight aria-hidden /></Link></div>
}

export function OverviewView() {
  const state = useDeployState()
  const now = useNow(15000)
  const deploy = useDeploy()
  if (!state) return <PageSkeleton variant="overview" />
  const server = homeServer(state)
  const projects = [...state.projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const activity = state.activity.slice(0, 5)
  const inFlight = state.deployments.filter((item) => !["ready", "failed", "canceled", "stopped"].includes(item.status))
  const failed = projects.filter((project) => projectBadge(project, deploy.latestDeployment(project.id)) === "failed")
  const waiting = state.domains.filter((domain) => domain.status === "dns-required" || domain.status === "invalid")
  const headline = !server || server.status === "offline" ? "Server unavailable." : failed.length
    ? "A deployment needs attention." : inFlight.length ? "A deployment is in progress." : "Infrastructure is healthy."

  const running = projects.filter(project => projectBadge(project, deploy.latestDeployment(project.id)) === "ready").length
  const successes = state.activity.filter((event) => event.result === "success").length
  const problems = state.activity.filter((event) => event.result === "warning" || event.result === "error").length
  const readyReleases = state.deployments.filter((item) => item.status === "ready").length
  const verified = state.domains.filter((domain) => domain.status === "active").length
  const runningContainers = state.containers.filter((container) => container.state === "running").length
  const recent = [...state.deployments].sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3)

  return (
    <div className="page overview">
      <section className="overview-intro">
        <div className="intro-copy">
          <p className="intro-eyebrow">{state.settings.workspaceName} <span>Deployment overview</span></p>
          <h1>{greeting(state.settings.displayName, now)}</h1>
          <p className="intro-description">Your projects, from first commit to production. Deploy to your own server and keep every release, container, and domain in view.</p>
          <div className="intro-actions"><Link href="/projects/new" className="btn btn-primary"><Plus size={15} />Deploy a project</Link><Link href="/docs" className="intro-text-link">Quick start<ArrowUpRight size={14} /></Link></div>
          <p className="intro-footnote"><span className="status-dot" />{headline}<span className="text-faint">Phase 1 · simulated infrastructure</span></p>
        </div>
        <div className="intro-system" aria-label="Deployment workflow">
          <div className="system-caption"><span>YOUR DEPLOYMENT PIPELINE</span><span className="system-mode">Self-hosted</span></div>
          <div className="pipeline"><PipelineStep icon={GitBranchIcon} title="Source" detail="GitHub or upload" /><span className="pipeline-line" /><PipelineStep icon={BoxesIcon} title="Build" detail="Detect & configure" /><span className="pipeline-line" /><PipelineStep icon={EarthIcon} title="Deploy" detail="Your infrastructure" live /></div>
          <Link href={server ? `/servers/${server.id}` : '/servers'} className="intro-server"><span className="intro-server-icon"><Server size={17} /></span><span><strong>{server?.name ?? "Connect a server"}</strong><small>{server ? `${server.os} · ${server.ip}` : "A home for your applications"}</small></span>{server ? <ServerStatusView value={server.status} /> : <ArrowRight size={16} />}</Link>
        </div>
      </section>

      <div className="overview-stats">
        <Stat href="/projects" icon={FolderKanbanIcon} label="Projects" value={state.projects.length} detail={`${running} ready to serve`} />
        <Stat href="/deployments" icon={GitBranchIcon} label="Deployments" value={state.deployments.length} detail={inFlight.length ? `${inFlight.length} in progress` : 'No builds in progress'} />
        <Stat href="/containers" icon={BoxesIcon} label="Containers" value={state.containers.filter(c => c.state === 'running').length} detail={`Running across ${state.servers.length} server${state.servers.length === 1 ? '' : 's'}`} />
        <Stat href="/domains" icon={EarthIcon} label="Domains" value={state.domains.length} detail={waiting.length ? `${waiting.length} need verification` : 'All domains verified'} />
      </div>

      {server?.status === "offline" || failed.length || waiting.length ? <div className="notice-list" aria-label="Needs attention">
        {server?.status === "offline" ? <Link href={`/servers/${server.id}`} className="notice-row"><CircleAlert aria-hidden /><span><strong>{server.name}</strong> is offline. Reconnect it to deploy again.</span><span className="notice-action">Review<ArrowRight size={14} /></span></Link> : null}
        {failed.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="notice-row"><CircleAlert aria-hidden /><span><strong>{project.name}</strong> failed its latest deployment.</span><span className="notice-action">Review<ArrowRight size={14} /></span></Link>)}
        {waiting.map((domain) => <Link key={domain.id} href="/domains" className="notice-row"><CircleAlert aria-hidden /><span><strong className="font-medium">{domain.name}</strong><span className="ml-2 text-muted">{domain.status === "invalid" ? "Check DNS configuration" : "Waiting for DNS verification"}</span></span><span className="notice-action">Review<ArrowRight size={14} /></span></Link>)}
      </div> : null}

      <div className="overview-split">
        <section className="min-w-0">
        <SectionHeading title="Projects" href="/projects" />
        <div className="panel">
          {
            <ul className="panel-list overview-project-list">{projects.slice(0, 4).map((project) => {
              const latest = deploy.latestDeployment(project.id)
              return <li key={project.id}><Link href={`/projects/${project.id}`} className="overview-project">
                <span className="project-identity"><span className="framework-mark">{project.framework === "fastapi" ? <Zap aria-hidden /> : <Code2 aria-hidden />}</span><span className="min-w-0"><strong>{project.name}</strong><small>{sourceText(project)}</small></span></span>
                <span className="project-environment capitalize text-muted">{project.environment}</span>
                <span className="framework-label text-muted">{FRAMEWORKS[project.framework].label}</span>
                <DeploymentStatusView value={projectBadge(project, latest)} />
                <time className="text-faint tabular-nums" dateTime={project.updatedAt}>{formatRelative(project.updatedAt, now)}</time>
              </Link></li>
            })}
            {projects.length < 4 ? (
              <li className="overview-project-slot" style={{ flexGrow: 4 - projects.length }}>
                <Link href="/projects/new">
                  <span className="overview-project-slot-icon"><Plus aria-hidden /></span>
                  <span className="min-w-0"><strong>{projects.length === 0 ? "No projects yet — deploy your first one" : `Room for ${4 - projects.length === 1 ? "another project" : `${4 - projects.length} more projects`}`}</strong><small>Deploy from GitHub, an upload, or a container image.</small></span>
                  <span className="overview-project-slot-cta">New project<ArrowUpRight aria-hidden /></span>
                </Link>
              </li>
            ) : null}
            </ul>}
        </div>
        </section>
        <section className="min-w-0">
          <SectionHeading title="Releases this week" href="/deployments" action="All releases" />
          <ReleaseChart deployments={state.deployments} now={now} />
        </section>
      </div>

      <AskArcCard />

      <section><SectionHeading title="Latest deployments" href="/deployments" /><div className="panel"><ul className="panel-list">{recent.map(deployment => <li key={deployment.id}><Link className="release-row" href={`/deployments/${deployment.id}`}><span className="release-icon"><GitBranch size={16} /></span><span className="min-w-0"><strong>{state.projects.find(p => p.id === deployment.projectId)?.name ?? 'Project'}</strong><small className="block truncate text-faint">{deployment.commitMessage || deployment.sourceLabel}</small></span><span className="release-branch">{deployment.branch ?? 'Direct upload'}</span><DeploymentStatusView value={deployment.status} /><time className="text-faint">{formatRelative(deployment.createdAt, now)}</time></Link></li>)}{!recent.length && [0, 1, 2].map((row) => <li key={row} className="release-ghost" aria-hidden={row > 0}><span className="release-icon"><GitBranch size={16} /></span><span className="min-w-0 flex-1">{row === 0 ? <><strong>No deployments yet</strong><small className="block text-faint">Releases appear here with their branch, status, and time.</small></> : <><b /><b /></>}</span></li>)}</ul></div></section>

      <div className="overview-lower">
        {server ? <section>
          <SectionHeading title="Server" href={`/servers/${server.id}`} action="Open server" />
          <div className="panel server-summary dashboard-summary-card">
            <div className="flex items-start justify-between gap-3"><div><Link href={`/servers/${server.id}`} className="text-sm font-semibold hover:underline">{server.name}</Link><p className="mt-1 text-xs text-faint">{server.os} · {server.arch}</p></div><ServerStatusView value={server.status} /></div>
            <ul className="activity-mini">
              <li><span className="activity-mini-dot" data-result="info" aria-hidden /><span className="min-w-0 flex-1 truncate"><span className="font-medium">Address</span><span className="text-faint"> · {server.iface}</span></span><code className="font-mono text-[11px] text-muted">{server.ip}</code></li>
              <li><span className="activity-mini-dot" data-result={server.dockerStatus === "running" ? "success" : "error"} aria-hidden /><span className="min-w-0 flex-1 truncate"><span className="font-medium">Docker</span><span className="text-faint"> · {server.dockerStatus}</span></span><time>{server.dockerVersion}</time></li>
              <li><span className="activity-mini-dot" data-result={server.agentStatus === "connected" ? "success" : "error"} aria-hidden /><span className="min-w-0 flex-1 truncate"><span className="font-medium">Agent</span><span className="text-faint"> · {server.agentStatus}</span></span><time>up {formatUptime(server.startedAt, now)}</time></li>
            </ul>
            <hr className="hairline my-5" />
            {server.status === "offline" ? <p className="text-sm text-muted">Metrics are paused while the server is offline.</p> : <dl className="server-resource-grid">
              <Metric label="CPU" value={`${server.cpuPercent}%`} meter={server.cpuPercent} />
              <Metric label="Memory" value={`${formatGb(server.memoryUsedGb)} / ${formatGb(server.memoryTotalGb)}`} meter={server.memoryUsedGb / server.memoryTotalGb * 100} />
              <Metric label="Storage" value={`${formatGb(server.storageUsedGb)} / ${formatGb(server.storageTotalGb)}`} meter={server.storageUsedGb / server.storageTotalGb * 100} />
              <div className="resource-stat network-stat"><dt>Network</dt><dd>{server.networkMbps}<small> Mbps</small></dd><span className="text-faint text-xs">Current throughput</span></div>
            </dl>}
          </div>
        </section> : null}

        <section>
          <SectionHeading title="Recent activity" href="/activity" />
          <div className="panel server-summary dashboard-summary-card activity-summary">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-semibold">Workspace activity</p><p className="mt-1 text-xs text-faint">{state.activity.length} events recorded · {state.settings.displayName}</p></div>
              <Status tone={problems ? "warning" : "success"} icon={problems ? CircleAlert : Check} label={problems ? `${problems} to review` : "All clear"} />
            </div>
            <ul className="activity-mini">
              {activity.slice(0, 3).map((event) => <li key={event.id}>
                <span className="activity-mini-dot" data-result={event.result} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{event.href ? <Link href={event.href} className="font-medium hover:underline">{event.action}</Link> : <span className="font-medium">{event.action}</span>}<span className="text-faint"> · {event.objectName}</span></span>
                <time dateTime={event.timestamp}>{formatRelative(event.timestamp, now)}</time>
              </li>)}
              {activity.length === 0 ? <li className="text-muted">Changes to this workspace will appear here.</li> : null}
            </ul>
            <hr className="hairline my-5" />
            <dl className="server-resource-grid">
              <Metric label="Successful changes" value={`${pct(successes, state.activity.length)}%`} meter={pct(successes, state.activity.length)} />
              <Metric label="Releases ready" value={`${readyReleases} / ${state.deployments.length}`} meter={pct(readyReleases, state.deployments.length)} />
              <Metric label="Domains verified" value={`${verified} / ${state.domains.length}`} meter={pct(verified, state.domains.length)} />
              <Metric label="Containers running" value={`${runningContainers} / ${state.containers.length}`} meter={pct(runningContainers, state.containers.length)} />
            </dl>
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, meter }: { label: string; value: string; meter: number }) {
  return <div className="resource-stat"><dt>{label}</dt><dd>{value}</dd><span className="resource-segments" role="meter" aria-label={label} aria-valuenow={Math.round(meter)} aria-valuemin={0} aria-valuemax={100}>{Array.from({length:20},(_,i)=><i key={i} data-filled={i < Math.ceil(meter / 5)} />)}</span></div>
}

function Stat({ href, icon: Icon, label, value, detail }: { href: string; icon: AnimatedIcon; label: string; value: number; detail: string }) {
  const { ref, bind } = useIconAnimation()
  return <Link href={href} className="overview-stat" {...bind}><span className="stat-label">{label}<Icon ref={ref} size={16} className="animated-glyph" /></span><strong>{value}<ArrowUpRight /></strong><small>{detail}</small></Link>
}

function PipelineStep({ icon: Icon, title, detail, live }: { icon: AnimatedIcon; title: string; detail: string; live?: boolean }) {
  const { ref, bind } = useIconAnimation()
  return <div {...bind}><span className={live ? "pipeline-icon pipeline-live" : "pipeline-icon"}><Icon ref={ref} size={19} className="animated-glyph" /></span><strong>{title}</strong><small>{detail}</small></div>
}

function AskArcCard() {
  const { ref, bind } = useIconAnimation()
  return <Link href="/chat" className="overview-chat" {...bind}><span className="chat-spark"><SparklesIcon ref={ref} size={25} className="animated-glyph" /></span><span><strong>Ask Arc — a second pair of eyes on your projects.</strong><small>Ask what’s running, check a deployment, or find what needs attention.</small></span><span className="chat-open">Ask Arc<ArrowUpRight size={15} /></span></Link>
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}
