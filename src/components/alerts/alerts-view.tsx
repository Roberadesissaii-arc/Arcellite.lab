"use client"

import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
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
  const empty = server?.status !== "offline" && failed.length === 0 && domains.length === 0 && stopped.length === 0

  return (
    <div className="page">
      <PageHeader title="Alerts" description="Anything on this server that needs a look." />
      {empty ? (
        <div className="panel mt-6">
          <EmptyState title="Nothing needs attention" body="Servers are online, and the latest releases are healthy." />
        </div>
      ) : (
        <ul className="panel mt-6 divide-y divide-zinc-200">
          {server?.status === "offline" ? (
            <li>
              <Link href={`/servers/${server.id}`} className="block px-4 py-3">
                <span className="block text-sm font-medium text-[#c4272e]">Server offline</span>
                <span className="text-sm text-zinc-600">{server.name} is not accepting heartbeats.</span>
              </Link>
            </li>
          ) : null}
          {failed.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`} className="block px-4 py-3">
                <span className="block text-sm font-medium">Deployment failed</span>
                <span className="text-sm text-zinc-600">{project.name}</span>
              </Link>
            </li>
          ))}
          {domains.map((domain) => (
            <li key={domain.id}>
              <Link href="/domains" className="block px-4 py-3">
                <span className="block text-sm font-medium">{domain.name}</span>
                <span className="text-sm text-zinc-600">{domain.status === "invalid" ? "Verification failed" : "Waiting on DNS"}</span>
              </Link>
            </li>
          ))}
          {stopped.map((container) => (
            <li key={container.id}>
              <Link href={`/containers?inspect=${container.id}`} className="block px-4 py-3">
                <span className="block text-sm font-medium">{container.name}</span>
                <span className="text-sm text-zinc-600">Container is {container.state}.</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
