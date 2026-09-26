"use client"

import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { mapProjectsToTableRows, ProjectsTable } from "@/components/projects/projects-table"
import { Button } from "@/components/ui/button"
import { copyText, EmptyState, PageSkeleton } from "@/components/ui/bits"
import { SelectInput, TextInput } from "@/components/ui/fields"
import { ConfirmDialog } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { filterProjects, type ProjectSort } from "@/lib/deploy/filters"
import { DeployError } from "@/lib/deploy/types"
import { latestDeployment, projectBadge } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import type { DeploymentStatus, EnvironmentName, Project } from "@/lib/deploy/types"

export function ProjectsView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const now = useNow()
  const toast = useToast()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [environment, setEnvironment] = useState<EnvironmentName | "all">("all")
  const [status, setStatus] = useState<DeploymentStatus | "all">("all")
  const [sort, setSort] = useState<ProjectSort>("recent")
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)

  const rows = useMemo(() => {
    if (!state) return []
    return filterProjects(state.projects, (project) => projectBadge(project, latestDeployment(state.deployments, project.id, now)), {
      search,
      environment,
      status,
      sort,
    })
  }, [state, search, environment, status, sort, now])

  const serverIp = state?.servers[0]?.ip

  const tableRows = useMemo(() => {
    if (!state) return []
    return mapProjectsToTableRows(rows, {
      now,
      serverIp,
      badgeFor: (project) => projectBadge(project, latestDeployment(state.deployments, project.id, now)),
    })
  }, [state, rows, now, serverIp])

  const handleOpen = useCallback((projectId: string) => {
    router.push(`/projects/${projectId}`)
  }, [router])

  const handleRedeploy = useCallback((projectId: string) => {
    void deploy.redeploy(projectId).then(
      (deployment) => router.push(`/deployments/${deployment.id}`),
      (error: unknown) => {
        if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
      },
    )
  }, [deploy, router, toast])

  const handleLogs = useCallback((projectId: string) => {
    router.push(`/projects/${projectId}/logs`)
  }, [router])

  const handleSettings = useCallback((projectId: string) => {
    router.push(`/projects/${projectId}/settings`)
  }, [router])

  const handleCopyEndpoint = useCallback((endpoint: string) => {
    void copyText(endpoint).then((ok) =>
      toast(ok ? { title: "Endpoint copied" } : { title: "Could not copy", tone: "danger" }),
    )
  }, [toast])

  if (!state) return <PageSkeleton />

  return (
    <div className="page page-wide">
      <PageHeader
        kicker="Workspace"
        title="Projects"
        description="Applications deployed to this server — from first commit to production."
        actions={
          <Button variant="primary" onClick={() => router.push("/projects/new")}>
            New project
          </Button>
        }
      />
      <div className="filter-toolbar">
        <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" aria-label="Search projects" />
        <SelectInput aria-label="Environment" value={environment} onChange={(event) => setEnvironment(event.target.value as EnvironmentName | "all")}>
          <option value="all">All environments</option>
          <option value="production">Production</option>
          <option value="preview">Preview</option>
          <option value="development">Development</option>
        </SelectInput>
        <SelectInput aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as DeploymentStatus | "all")}>
          <option value="all">All statuses</option>
          {["ready", "building", "deploying", "preparing", "queued", "failed", "canceled", "stopped"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </SelectInput>
        <SelectInput aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as ProjectSort)}>
          <option value="recent">Recent</option>
          <option value="name">Name</option>
          <option value="status">Status</option>
        </SelectInput>
      </div>
      <div className="projects-list-wrap">
        {state.projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            body="Deploy your first application from GitHub or upload a project."
            action={
              <Button variant="primary" onClick={() => router.push("/projects/new")}>
                New project
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title="No projects match" body="Try a different name, environment, or status." />
        ) : (
          <ProjectsTable
            rows={tableRows}
            now={now}
            onOpen={handleOpen}
            onRedeploy={handleRedeploy}
            onLogs={handleLogs}
            onSettings={handleSettings}
            onDeleteRequest={setPendingDelete}
            onCopyEndpoint={handleCopyEndpoint}
          />
        )}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : "Delete project?"}
        body="This removes the project from Arcellite Deploy, including its variables and domain attachments in this demo. Phase 1 does not change a live server."
        confirmLabel="Delete project"
        danger
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => {
          if (!pendingDelete) return
          void deploy.deleteProject(pendingDelete.id).then(() => {
            toast({ title: "Project deleted", description: pendingDelete.name })
            setPendingDelete(null)
          })
        }}
      />
    </div>
  )
}
