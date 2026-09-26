"use client"

import Link from "next/link"
import { ArrowRight, Boxes, Check, CircleAlert, Code2, FolderKanban, Server, Zap, GitBranch, Globe2, Sparkle, ArrowUpRight, Plus } from "lucide-react"
import { DeploymentStatusView, ServerStatusView } from "@/components/ui/status"
import { PageSkeleton } from "@/components/ui/bits"
import { FRAMEWORKS } from "@/lib/deploy/detect"
import { formatGb, formatRelative, greeting } from "@/lib/deploy/format"
import { homeServer, latestDeployment, projectBadge, sourceText } from "@/lib/deploy/helpers"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

function SectionHeading({ title, href, action = "View all" }: { title: string; href: string; action?: string }) {
  return <div className="section-heading"><h2>{title}</h2><Link href={href}>{action}<ArrowRight aria-hidden /></Link></div>
}

export function OverviewView() {
  const state = useDeployState()
  const now = useNow(15000)
  if (!state) return <PageSkeleton variant="overview" />
  const server = homeServer(state)
  const projects = [...state.projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const activity = state.activity.slice(0, 5)
  const inFlight = state.deployments.filter((item) => !["ready", "failed", "canceled", "stopped"].includes(item.status))
  const failed = projects.filter((project) => projectBadge(project, latestDeployment(state.deployments, project.id, now)) === "failed")
  const waiting = state.domains.filter((domain) => domain.status === "dns-required" || domain.status === "invalid")
  const headline = !server || server.status === "offline" ? "Server unavailable." : failed.length
    ? "A deployment needs attention." : inFlight.length ? "A deployment is in progress." : "Infrastructure is healthy."

  const running = projects.filter(project => projectBadge(project, latestDeployment(state.deployments, project.id, now)) === "ready").length
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
          <div className="pipeline"><div><span className="pipeline-icon"><GitBranch /></span><strong>Source</strong><small>GitHub or upload</small></div><span className="pipeline-line" /><div><span className="pipeline-icon"><Boxes /></span><strong>Build</strong><small>Detect & configure</small></div><span className="pipeline-line" /><div><span className="pipeline-icon pipeline-live"><Globe2 /></span><strong>Deploy</strong><small>Your infrastructure</small></div></div>
          <Link href={server ? `/servers/${server.id}` : '/servers'} className="intro-server"><span className="intro-server-icon"><Server size={17} /></span><span><strong>{server?.name ?? "Connect a server"}</strong><small>{server ? `${server.os} · ${server.ip}` : "A home for your applications"}</small></span>{server ? <ServerStatusView value={server.status} /> : <ArrowRight size={16} />}</Link>
        </div>
      </section>

      <div className="overview-stats">
        <Stat href="/projects" icon={<FolderKanban />} label="Projects" value={state.projects.length} detail={`${running} ready to serve`} />
        <Stat href="/deployments" icon={<GitBranch />} label="Deployments" value={state.deployments.length} detail={inFlight.length ? `${inFlight.length} in progress` : 'No builds in progress'} />
        <Stat href="/containers" icon={<Boxes />} label="Containers" value={state.containers.filter(c => c.state === 'running').length} detail={`Running across ${state.servers.length} server${state.servers.length === 1 ? '' : 's'}`} />
        <Stat href="/domains" icon={<Globe2 />} label="Domains" value={state.domains.length} detail={waiting.length ? `${waiting.length} need verification` : 'All domains verified'} />
      </div>

      {server?.status === "offline" || failed.length || waiting.length ? <div className="notice-list" aria-label="Needs attention">
        {server?.status === "offline" ? <Link href={`/servers/${server.id}`} className="notice-row"><CircleAlert aria-hidden /><span><strong>{server.name}</strong> is offline. Reconnect it to deploy again.</span><span className="notice-action">Review<ArrowRight size={14} /></span></Link> : null}
        {failed.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="notice-row"><CircleAlert aria-hidden /><span><strong>{project.name}</strong> failed its latest deployment.</span><span className="notice-action">Review<ArrowRight size={14} /></span></Link>)}
        {waiting.map((domain) => <Link key={domain.id} href="/domains" className="notice-row"><CircleAlert aria-hidden /><span><strong className="font-medium">{domain.name}</strong><span className="ml-2 text-muted">{domain.status === "invalid" ? "Check DNS configuration" : "Waiting for DNS verification"}</span></span><span className="notice-action">Review<ArrowRight size={14} /></span></Link>)}
      </div> : null}

      <section>
        <SectionHeading title="Projects" href="/projects" />
        <div className="panel">
          {projects.length === 0 ? <div className="p-6"><p className="font-medium">No projects yet</p><Link href="/projects/new" className="mt-3 inline-block text-brand">Deploy your first application →</Link></div> :
            <ul className="panel-list">{projects.map((project) => {
              const latest = latestDeployment(state.deployments, project.id, now)
              return <li key={project.id}><Link href={`/projects/${project.id}`} className="overview-project">
                <span className="project-identity"><span className="framework-mark">{project.framework === "fastapi" ? <Zap aria-hidden /> : <Code2 aria-hidden />}</span><span className="min-w-0"><strong>{project.name}</strong><small>{sourceText(project)}</small></span></span>
                <span className="project-environment capitalize text-muted">{project.environment}</span>
                <span className="framework-label text-muted">{FRAMEWORKS[project.framework].label}</span>
                <DeploymentStatusView value={projectBadge(project, latest)} />
                <time className="text-faint tabular-nums" dateTime={project.updatedAt}>{formatRelative(project.updatedAt, now)}</time>
              </Link></li>
            })}</ul>}
        </div>
      </section>

      <Link href="/chat" className="overview-chat"><span className="chat-spark"><Sparkle /></span><span><strong>Ask Arc — a second pair of eyes on your projects.</strong><small>Ask what’s running, check a deployment, or find what needs attention.</small></span><span className="chat-open">Ask Arc<ArrowUpRight size={15} /></span></Link>

      <section><SectionHeading title="Latest deployments" href="/deployments" /><div className="panel"><ul className="panel-list">{recent.map(deployment => <li key={deployment.id}><Link className="release-row" href={`/deployments/${deployment.id}`}><span className="release-icon"><GitBranch size={16} /></span><span className="min-w-0"><strong>{state.projects.find(p => p.id === deployment.projectId)?.name ?? 'Project'}</strong><small className="block truncate text-faint">{deployment.commitMessage || deployment.sourceLabel}</small></span><span className="release-branch">{deployment.branch ?? 'Direct upload'}</span><DeploymentStatusView value={deployment.status} /><time className="text-faint">{formatRelative(deployment.createdAt, now)}</time></Link></li>)}{!recent.length && <li className="p-5 text-muted">Your first deployment will appear here.</li>}</ul></div></section>

      <div className="overview-lower">
        {server ? <section>
          <SectionHeading title="Server" href={`/servers/${server.id}`} action="Open server" />
          <div className="panel server-summary dashboard-summary-card">
            <div className="flex items-start justify-between gap-3"><div><Link href={`/servers/${server.id}`} className="text-sm font-semibold hover:underline">{server.name}</Link><p className="mt-1 text-xs text-faint">{server.os} · {server.arch}</p></div><ServerStatusView value={server.status} /></div>
            <p className="mt-3 font-mono text-xs text-muted">{server.ip}</p>
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
          <ul className="panel activity-timeline dashboard-summary-card">
            {activity.map((event) => <li key={event.id} className="activity-row">
              {event.result === "success" ? <Check aria-hidden /> : <CircleAlert aria-hidden className="text-faint" />}
              <span className="min-w-0">{event.href ? <Link href={event.href} className="font-medium hover:underline">{event.action}</Link> : <span className="font-medium">{event.action}</span>}<span className="block truncate text-[11px] text-faint">{event.objectName}</span></span>
              <time dateTime={event.timestamp}>{formatRelative(event.timestamp, now)}</time>
            </li>)}
            {activity.length === 0 ? <li className="p-5 text-sm text-muted">Changes to this workspace will appear here.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, meter }: { label: string; value: string; meter: number }) {
  return <div className="resource-stat"><dt>{label}</dt><dd>{value}</dd><span className="resource-segments" role="meter" aria-label={label} aria-valuenow={Math.round(meter)} aria-valuemin={0} aria-valuemax={100}>{Array.from({length:20},(_,i)=><i key={i} data-filled={i < Math.ceil(meter / 5)} />)}</span></div>
}

function Stat({ href, icon, label, value, detail }: { href: string; icon: React.ReactNode; label: string; value: number; detail: string }) {
  return <Link href={href} className="overview-stat"><span className="stat-label">{label}{icon}</span><strong>{value}<ArrowUpRight /></strong><small>{detail}</small></Link>
}
