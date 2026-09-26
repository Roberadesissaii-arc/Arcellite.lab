"use client"

import { Code2, GitBranch, Globe2, KeyRound, LayoutDashboard, MoreHorizontal, Rocket, RotateCcw, Settings, Terminal, Zap } from "lucide-react"
import { Tag } from "@/components/ui/kit"
import { FRAMEWORKS } from "@/lib/deploy/detect"
import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button, IconButton } from "@/components/ui/button"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
import { ConfirmDialog, Menu, MenuItem, MenuSeparator } from "@/components/ui/overlays"
import { DeploymentStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { DeployError } from "@/lib/deploy/types"
import { latestDeployment, projectBadge, sourceText } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

const TABS = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/logs", label: "Logs", icon: Terminal },
  { href: "/environment", label: "Environment", icon: KeyRound },
  { href: "/domains", label: "Domains", icon: Globe2 },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function ProjectFrame({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId: string }>()
  const pathname = usePathname()
  const state = useDeployState()
  const deploy = useDeploy()
  const now = useNow()
  const toast = useToast()
  const router = useRouter()
  const [remove, setRemove] = useState(false)
  const project = state?.projects.find((item) => item.id === params.projectId)

  useEffect(() => {
    if (project) document.title = `${project.name} · Arcellite Deploy`
  }, [project])

  if (!state) return <PageSkeleton variant="detail" />
  if (!project) {
    return (
      <div className="page">
        <EmptyState title="Project not found" body="It may have been deleted from this workspace." action={<Button variant="primary" onClick={() => router.push("/projects")}>All projects</Button>} />
      </div>
    )
  }
  const latest = latestDeployment(state.deployments, project.id, now)
  const base = `/projects/${project.id}`
  const githubOff = project.source.type === "github" && !state.github.connected

  return (
    <div className="page page-wide page-stack project-page">
      <header className="page-introduction project-hero">
        <div className="page-introduction-main">
          <span className="page-introduction-icon">{project.framework === "fastapi" ? <Zap aria-hidden /> : <Code2 aria-hidden />}</span>
          <div className="min-w-0">
            <p className="page-kicker">Project</p>
            <h1 className="page-title mt-1 font-heading">{project.name}<span className="text-brand">.</span></h1>
            <p className="page-copy mt-2">{sourceText(project)}</p>
            <div className="project-hero-meta">
              <DeploymentStatusView value={projectBadge(project, latest)} />
              <Tag tone={project.environment === "production" ? "brand" : project.environment === "preview" ? "info" : "neutral"}><span className="capitalize">{project.environment}</span></Tag>
              <Tag>{FRAMEWORKS[project.framework].label}</Tag>
              {project.branch ? <Tag><GitBranch size={11} aria-hidden />{project.branch}</Tag> : null}
            </div>
          </div>
        </div>
        <div className="page-introduction-actions">
          <Button
            variant="primary"
            onClick={() => {
              void deploy.redeploy(project.id).then(
                (deployment) => router.push(`/deployments/${deployment.id}`),
                (error: unknown) => {
                  if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
                },
              )
            }}
          >
            <RotateCcw aria-hidden />Redeploy
          </Button>
          <Menu
            trigger={
              <IconButton label="Project actions">
                <MoreHorizontal />
              </IconButton>
            }
          >
            <MenuItem onSelect={() => router.push(`${base}/logs`)}>View logs</MenuItem>
            <MenuItem onSelect={() => router.push(`${base}/environment`)}>Environment variables</MenuItem>
            <MenuItem onSelect={() => router.push(`${base}/settings`)}>Settings</MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setRemove(true)}>Delete</MenuItem>
          </Menu>
        </div>
      </header>
      {githubOff ? (
        <p className="mt-4 text-sm text-[var(--status-warning)]">
          Repository access lost for {project.source.type === "github" ? project.source.fullName : "this source"}. Reconnect GitHub in Settings to deploy again.
        </p>
      ) : null}
      {project.runtime === "stopped" && latest?.status === "ready" ? (
        <p className="mt-4 text-sm text-muted">The latest release is ready, but the web container is stopped.</p>
      ) : null}
      <nav className="project-tabs" aria-label="Project">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`
          const active = tab.href === "" ? pathname === base : pathname.startsWith(href)
          const Icon = tab.icon
          return (
            <Link key={tab.label} href={href} aria-current={active ? "page" : undefined} className="project-tab">
              <Icon aria-hidden />{tab.label}
            </Link>
          )
        })}
      </nav>
      <div className="pt-5">{children}</div>
      <ConfirmDialog
        open={remove}
        title={`Delete ${project.name}?`}
        body="This removes the project from the control plane. Phase 1 does not stop a real container."
        confirmLabel="Delete project"
        danger
        onOpenChange={setRemove}
        onConfirm={() => {
          void deploy.deleteProject(project.id).then(() => {
            toast({ title: "Project deleted" })
            router.push("/projects")
          })
        }}
      />
    </div>
  )
}
