import type { AppState, Deployment, DeploymentStatus, EnvironmentName, Project } from "./types"
import { sourceText } from "./helpers"
import { FRAMEWORKS } from "./detect"

export type ProjectSort = "recent" | "name" | "status"

export interface ProjectQuery {
  search: string
  environment: EnvironmentName | "all"
  status: DeploymentStatus | "all"
  sort: ProjectSort
}

export function filterProjects(
  projects: Project[],
  statusOf: (project: Project) => DeploymentStatus,
  query: ProjectQuery,
): Project[] {
  const search = query.search.trim().toLowerCase()
  const filtered = projects.filter((project) => {
    if (query.environment !== "all" && project.environment !== query.environment) return false
    if (query.status !== "all" && statusOf(project) !== query.status) return false
    if (!search) return true
    const haystack = [
      project.name,
      project.slug,
      project.hostname,
      sourceText(project),
      FRAMEWORKS[project.framework].label,
      project.framework,
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(search)
  })
  const sorted = [...filtered]
  sorted.sort((a, b) => {
    if (query.sort === "name") return a.name.localeCompare(b.name)
    if (query.sort === "status") return statusOf(a).localeCompare(statusOf(b))
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  })
  return sorted
}

export interface DeploymentQuery {
  search: string
  projectId: string | "all"
  environment: EnvironmentName | "all"
  status: DeploymentStatus | "all"
}

export function filterDeployments(
  deployments: Deployment[],
  projects: Project[],
  query: DeploymentQuery,
): Deployment[] {
  const names = new Map(projects.map((project) => [project.id, project.name.toLowerCase()]))
  const search = query.search.trim().toLowerCase()
  return deployments
    .filter((deployment) => {
      if (query.projectId !== "all" && deployment.projectId !== query.projectId) return false
      if (query.environment !== "all" && deployment.environment !== query.environment) return false
      if (query.status !== "all" && deployment.status !== query.status) return false
      if (!search) return true
      const haystack = [
        names.get(deployment.projectId) ?? "",
        deployment.commitSha,
        deployment.commitMessage,
        deployment.branch ?? "",
        deployment.sourceLabel,
        deployment.status,
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(search)
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export interface SearchHit {
  id: string
  kind: "Project" | "Deployment" | "Server" | "Container" | "Domain"
  title: string
  subtitle: string
  href: string
}

export function searchGlobal(state: AppState, raw: string): SearchHit[] {
  const query = raw.trim().toLowerCase()
  if (!query) return []
  const hits: SearchHit[] = []
  for (const project of state.projects) {
    if (`${project.name} ${sourceText(project)} ${project.hostname}`.toLowerCase().includes(query)) {
      hits.push({
        id: project.id,
        kind: "Project",
        title: project.name,
        subtitle: sourceText(project),
        href: `/projects/${project.id}`,
      })
    }
  }
  for (const deployment of state.deployments) {
    const project = state.projects.find((item) => item.id === deployment.projectId)
    const blob = `${project?.name ?? ""} ${deployment.commitSha} ${deployment.commitMessage}`.toLowerCase()
    if (blob.includes(query)) {
      hits.push({
        id: deployment.id,
        kind: "Deployment",
        title: deployment.commitMessage,
        subtitle: `${project?.name ?? "Project"} · ${deployment.commitSha}`,
        href: `/deployments/${deployment.id}`,
      })
    }
  }
  for (const server of state.servers) {
    if (`${server.name} ${server.ip} ${server.os}`.toLowerCase().includes(query)) {
      hits.push({
        id: server.id,
        kind: "Server",
        title: server.name,
        subtitle: server.ip,
        href: `/servers/${server.id}`,
      })
    }
  }
  for (const container of state.containers) {
    if (`${container.name} ${container.image}`.toLowerCase().includes(query)) {
      hits.push({
        id: container.id,
        kind: "Container",
        title: container.name,
        subtitle: container.image,
        href: `/containers?inspect=${container.id}`,
      })
    }
  }
  for (const domain of state.domains) {
    if (domain.name.toLowerCase().includes(query)) {
      const project = state.projects.find((item) => item.id === domain.projectId)
      hits.push({
        id: domain.id,
        kind: "Domain",
        title: domain.name,
        subtitle: project?.name ?? "Unassigned",
        href: "/domains",
      })
    }
  }
  return hits.slice(0, 12)
}
