"use client"

import { Box, CircleAlert, Globe2, ShieldCheck, Unplug } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, ItemList, ItemRow, SectionHeading, StatCard, StatGrid, Tag } from "@/components/ui/kit"
import { homeServer, latestDeployment, projectBadge } from "@/lib/deploy/helpers"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function AlertsView() {
  const state = useDeployState()
  const now = useNow()
  if (!state) return <PageSkeleton />
  const server = homeServer(state)
  const failed = state.projects.filter(
    (project) => projectBadge(project, latestDeployment(state.deployments, project.id, now)) === "failed",
  )
  const domains = state.domains.filter((domain) => domain.status === "dns-required" || domain.status === "invalid" || domain.status === "verifying")
  const stopped = state.containers.filter((container) => container.state === "stopped" || container.state === "exited")
  const offline = server?.status === "offline"
  const critical = (offline ? 1 : 0) + failed.length + domains.filter((domain) => domain.status === "invalid").length
  const total = (offline ? 1 : 0) + failed.length + domains.length + stopped.length

  return (
    <div className="page page-stack">
      <PageHeader icon={ShieldCheck} kicker="Observe" title="Alerts" description="Anything on this server that needs a look, ordered by how urgent it is." />
      <StatGrid>
        <StatCard icon={CircleAlert} tone={critical ? "danger" : "success"} label="Critical" value={critical} detail={critical ? "Act on these first" : "Nothing critical"} />
        <StatCard icon={Unplug} tone={offline ? "danger" : "success"} label="Server" value={offline ? "Offline" : "Online"} detail={server?.name ?? "No server"} />
        <StatCard icon={Globe2} tone={domains.length ? "warning" : "neutral"} label="Domains pending" value={domains.length} href="/domains" detail="DNS or verification" />
        <StatCard icon={Box} tone={stopped.length ? "warning" : "neutral"} label="Stopped containers" value={stopped.length} href="/containers" detail="Stopped or exited" />
      </StatGrid>
      <section>
        <SectionHeading title="Open alerts" count={total} />
        {total === 0 ? (
          <EmptyPanel icon={ShieldCheck} title="Nothing needs attention" body="Servers are online, and the latest releases are healthy." />
        ) : (
          <ItemList label="Alerts">
            {offline && server ? (
              <ItemRow href={`/servers/${server.id}`} icon={Unplug} tone="danger" title="Server offline" subtitle={`${server.name} is not accepting heartbeats.`} trailing={<Tag tone="danger">Critical</Tag>} />
            ) : null}
            {failed.map((project) => (
              <ItemRow key={project.id} href={`/projects/${project.id}`} icon={CircleAlert} tone="danger" title="Deployment failed" subtitle={`${project.name} — the latest release did not finish.`} trailing={<Tag tone="danger">Critical</Tag>} />
            ))}
            {domains.map((domain) => (
              <ItemRow key={domain.id} href="/domains" icon={Globe2} tone={domain.status === "invalid" ? "danger" : "warning"} title={domain.name} subtitle={domain.status === "invalid" ? "Verification failed. Check the DNS records." : "Waiting on DNS before a certificate can be issued."} trailing={<Tag tone={domain.status === "invalid" ? "danger" : "warning"}>{domain.status === "invalid" ? "Critical" : "Warning"}</Tag>} />
            ))}
            {stopped.map((container) => (
              <ItemRow key={container.id} href={`/containers?inspect=${container.id}`} icon={Box} tone="warning" title={container.name} subtitle={`Container is ${container.state}.`} trailing={<Tag tone="warning">Warning</Tag>} />
            ))}
          </ItemList>
        )}
      </section>
    </div>
  )
}
