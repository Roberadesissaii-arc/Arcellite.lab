"use client"

import { ExternalLink, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button, IconButton } from "@/components/ui/button"
import { copyText, EmptyState, PageSkeleton } from "@/components/ui/bits"
import { ConfirmDialog, Menu, MenuItem, MenuSeparator } from "@/components/ui/overlays"
import { DeploymentStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { DeployError } from "@/lib/deploy/types"
import { latestDeployment, projectBadge, projectEndpoint } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

const TABS = [
  { href: "", label: "Overview" },
  { href: "/deployments", label: "Deployments" },
  { href: "/logs", label: "Logs" },
  { href: "/environment", label: "Environment" },
  { href: "/domains", label: "Domains" },
  { href: "/settings", label: "Settings" },
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
  const endpoint = projectEndpoint(project, state.servers[0]?.ip)
  const base = `/projects/${project.id}`
  const githubOff = project.source.type === "github" && !state.github.connected

  return (
    <div className="page page-wide">
      <div className="page-introduction">
        <div>
          <p className="page-kicker">Project overview</p><h1 className="page-title">{project.name}</h1><p className="page-copy mt-2">Manage releases, runtime logs, environment variables, and domains.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="capitalize text-muted">{project.environment}</span>
            <DeploymentStatusView value={projectBadge(project, latest)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{endpoint}</span>
          <Button
            variant="secondary"
            onClick={() => {
              void copyText(endpoint).then((ok) => toast(ok ? { title: "Endpoint copied" } : { title: "Could not copy", tone: "danger" }))
            }}
          >
            Copy
          </Button>
          <a className="btn btn-primary" href={endpoint} target="_blank" rel="noreferrer">
            Visit
            <ExternalLink aria-hidden />
          </a>
          <Menu
            trigger={
              <IconButton label="Project actions">
                <MoreHorizontal />
              </IconButton>
            }
          >
            <MenuItem
              onSelect={() => {
                void deploy.redeploy(project.id).then(
                  (deployment) => router.push(`/deployments/${deployment.id}`),
                  (error: unknown) => {
                    if (error instanceof DeployError) toast({ title: error.title, description: error.detail, tone: "danger" })
                  },
                )
              }}
            >
              Redeploy
            </MenuItem>
            <MenuItem onSelect={() => router.push(`${base}/logs`)}>View logs</MenuItem>
            <MenuItem onSelect={() => router.push(`${base}/settings`)}>Settings</MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setRemove(true)}>Delete</MenuItem>
          </Menu>
        </div>
      </div>
      {githubOff ? (
        <p className="mt-4 text-sm text-[var(--status-warning)]">
          Repository access lost for {project.source.type === "github" ? project.source.fullName : "this source"}. Reconnect GitHub in Settings to deploy again.
        </p>
      ) : null}
      {project.runtime === "stopped" && latest?.status === "ready" ? (
        <p className="mt-4 text-sm text-muted">The latest release is ready, but the web container is stopped.</p>
      ) : null}
      <nav className="mt-6 flex gap-1 overflow-auto border-b border-[var(--border-subtle)]" aria-label="Project">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`
          const active = tab.href === "" ? pathname === base : pathname.startsWith(href)
          return (
            <Link key={tab.label} href={href} aria-current={active ? "page" : undefined} className="border-b-2 px-3 py-2 text-sm" style={{ borderColor: active ? "var(--brand-primary)" : "transparent", fontWeight: active ? 600 : 500, color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <div className="pt-6">{children}</div>
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
