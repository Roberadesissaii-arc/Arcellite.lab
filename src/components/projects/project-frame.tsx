"use client"

import { Code2, GitBranch, Globe2, KeyRound, LayoutDashboard, Rocket, RotateCcw, Settings, Terminal, Zap } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { Tag } from "@/components/ui/kit"
import { FRAMEWORKS } from "@/lib/deploy/detect"
import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { EmptyState, PageSkeleton } from "@/components/ui/bits"
import { DeploymentStatusView } from "@/components/ui/status"
import { useToast } from "@/components/ui/toast"
import { DeployError } from "@/lib/deploy/types"
import { projectBadge, sourceText } from "@/lib/deploy/helpers"
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
  // Re-read the latest deployment status on this interval.
  useNow()
  const toast = useToast()
  const router = useRouter()
  const reduced = useReducedMotion()
  const tabBase = `/projects/${params.projectId}`
  const activeIndex = Math.max(0, TABS.findIndex((tab) => (tab.href === "" ? pathname === tabBase : pathname.startsWith(`${tabBase}${tab.href}`))))
  // Content slides in from the side of the tab you came from.
  const [tabMotion, setTabMotion] = useState({ index: activeIndex, direction: 0 })
  if (tabMotion.index !== activeIndex) setTabMotion({ index: activeIndex, direction: activeIndex > tabMotion.index ? 1 : -1 })
  const direction = tabMotion.direction
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
  const latest = deploy.latestDeployment(project.id)
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
        {TABS.map((tab, index) => {
          const href = `${base}${tab.href}`
          const Icon = tab.icon
          const current = index === activeIndex
          return (
            <Link key={tab.label} href={href} aria-current={current ? "page" : undefined} className="project-tab">
              {current ? <motion.span layoutId="project-tab-pill" className="project-tab-pill" transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.36 }} /> : null}
              <span className="project-tab-label"><Icon aria-hidden />{tab.label}</span>
            </Link>
          )
        })}
      </nav>
      <motion.div
        key={pathname}
        className="project-tab-body"
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: direction * 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.36 }}
      >
        {children}
      </motion.div>
    </div>
  )
}
