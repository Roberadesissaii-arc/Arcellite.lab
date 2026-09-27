"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { mapProjectsToTableRows, ProjectsTable } from "@/components/projects/projects-table"
import { Button } from "@/components/ui/button"
import { copyText, PageSkeleton } from "@/components/ui/bits"
import { EmptyPanel, SearchField, SectionHeading, StatCard, StatGrid } from "@/components/ui/kit"
import { SelectInput } from "@/components/ui/fields"
import { ConfirmDialog } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { filterProjects, type ProjectSort } from "@/lib/deploy/filters"
import { DeployError } from "@/lib/deploy/types"
import { projectBadge } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import type { AppState, DeploymentStatus, EnvironmentName, Project } from "@/lib/deploy/types"
import { CircleAlert, CircleCheck, FolderKanban, Globe2, Plus, SearchX } from "lucide-react"

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

  // Recomputed each render (the clock ticks) so status badges follow in-flight deployments.
  const rows = state
    ? filterProjects(state.projects, (project) => projectBadge(project, deploy.latestDeployment(project.id)), {
        search,
        environment,
        status,
        sort,
      })
    : []

  const serverIp = state?.servers[0]?.ip

  const tableRows = state
    ? mapProjectsToTableRows(rows, {
        now,
        serverIp,
        badgeFor: (project) => projectBadge(project, deploy.latestDeployment(project.id)),
      })
    : []

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

  if (!state) return <PageSkeleton variant="table" />

  return (
    <div className="page page-wide page-stack">
      <PageHeader
        icon={FolderKanban}
        kicker="Workspace"
        title="Projects"
        description="Applications deployed to this server — from first commit to production."
        actions={
          <Button variant="primary" onClick={() => router.push("/projects/new")}>
            <Plus aria-hidden />New project
          </Button>
        }
      />
      <ProjectStats state={state} />
      <section>
      <SectionHeading title="All projects" count={state.projects.length} />
      <div className="filter-toolbar">
        <SearchField value={search} onChange={setSearch} placeholder="Search projects" label="Search projects" />
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
              {item.charAt(0).toUpperCase() + item.slice(1)}
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
          <EmptyPanel
            icon={FolderKanban}
            title="No projects yet"
            body="Deploy your first application from GitHub or upload a project."
            action={
              <Button variant="primary" onClick={() => router.push("/projects/new")}>
                New project
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyPanel icon={SearchX} title="No projects match" body="Try a different name, environment, or status." />
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
      </section>
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

function ProjectStats({ state }: { state: AppState }) {
  const deploy = useDeploy()
  useNow()
  const badges = state.projects.map((project) => projectBadge(project, deploy.latestDeployment(project.id)))
  const ready = badges.filter((badge) => badge === "ready").length
  const failed = badges.filter((badge) => badge === "failed").length
  const production = state.projects.filter((project) => project.environment === "production").length
  return (
    <StatGrid>
      <StatCard icon={FolderKanban} tone="brand" label="Projects" value={state.projects.length} detail={`${production} in production`} />
      <StatCard icon={CircleCheck} tone="success" label="Ready to serve" value={ready} detail="Latest release is live" />
      <StatCard icon={CircleAlert} tone={failed ? "danger" : "neutral"} label="Failing" value={failed} detail={failed ? "Latest release failed" : "No failing projects"} />
      <StatCard icon={Globe2} tone="info" label="Domains" value={state.domains.length} href="/domains" detail="Attached hostnames" />
    </StatGrid>
  )
}
