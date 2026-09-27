"use client"

import Link from "next/link"
import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import { formatDate } from "@/lib/deploy/format"
import { latestDeployment, projectBadge } from "@/lib/deploy/helpers"
import type { AppState, Project } from "@/lib/deploy/types"

const DAY = 24 * 60 * 60 * 1000
const DAYS = 30

export type Health = "up" | "degraded" | "down"
type DayState = Health | "none"

export interface ProjectHealth {
  project: Project
  health: Health
  label: string
  detail: string
  uptime: number | null
  days: { start: number; state: DayState; note: string }[]
}

/**
 * Up / degraded / down for a project, with a 30-day history derived from its
 * releases: a failed release marks that day degraded, a stopped web container
 * marks today down. Phase 1 has no external probe, so this is release health.
 */
export function projectHealth(state: AppState, project: Project, now: number): ProjectHealth {
  const latest = latestDeployment(state.deployments, project.id, now)
  const badge = projectBadge(project, latest)
  const web = state.containers.find((item) => item.projectId === project.id && item.role === "web")
  const down = project.runtime === "stopped" || !project.liveDeploymentId || web?.state === "stopped" || web?.state === "exited"
  const health: Health = down ? "down" : badge === "failed" ? "degraded" : "up"
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const created = Date.parse(project.createdAt)
  const deployments = state.deployments.filter((item) => item.projectId === project.id)
  const days = Array.from({ length: DAYS }, (_, index) => {
    const start = today.getTime() - (DAYS - 1 - index) * DAY
    const end = start + DAY
    if (end <= created) return { start, state: "none" as DayState, note: "Not deployed yet" }
    const inDay = deployments.filter((item) => {
      const time = Date.parse(item.createdAt)
      return time >= start && time < end
    })
    const failed = inDay.filter((item) => item.status === "failed").length
    if (index === DAYS - 1 && health !== "up") return { start, state: health as DayState, note: health === "down" ? "Not serving" : "Latest release failed" }
    if (failed) return { start, state: "degraded" as DayState, note: `${failed} failed release${failed === 1 ? "" : "s"}` }
    return { start, state: "up" as DayState, note: inDay.length ? `${inDay.length} release${inDay.length === 1 ? "" : "s"}, all healthy` : "Serving normally" }
  })
  const tracked = days.filter((day) => day.state !== "none")
  const uptime = tracked.length ? (tracked.reduce((sum, day) => sum + (day.state === "up" ? 1 : day.state === "degraded" ? 0.98 : 0), 0) / tracked.length) * 100 : null
  const label = health === "up" ? "Operational" : health === "degraded" ? "Degraded" : "Down"
  const detail = health === "up" ? "Serving the latest release" : health === "degraded" ? "Previous release still serving" : project.runtime === "stopped" ? "Web container stopped" : "No live release"
  return { project, health, label, detail, uptime, days }
}

export function HealthPill({ health, label }: { health: Health; label: string }) {
  return <span className="health-pill" data-health={health}><i aria-hidden />{label}</span>
}

export function UptimeBars({ days, label }: { days: ProjectHealth["days"]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const reduced = useReducedMotion()
  const focus = hover === null ? null : days[hover]
  return (
    <div className="uptime" onPointerLeave={() => setHover(null)}>
      <div className="uptime-bars" role="img" aria-label={`${label}: last ${days.length} days`}>
        {days.map((day, index) => (
          <motion.span
            key={day.start}
            data-state={day.state}
            data-active={hover === index || undefined}
            onPointerEnter={() => setHover(index)}
            initial={reduced ? false : { scaleY: 0.2, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0, duration: 0.45, delay: reduced ? 0 : index * 0.012 }}
          />
        ))}
      </div>
      <div className="uptime-axis">
        <span>{DAYS} days ago</span>
        <span className="uptime-focus" aria-live="polite">{focus ? `${formatDate(new Date(focus.start).toISOString())} · ${focus.note}` : ""}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

/** Status board for every project — which ones are up and which are down. */
export function ServiceStatusBoard({ state, now }: { state: AppState; now: number }) {
  const rows = state.projects.map((project) => projectHealth(state, project, now))
  if (!rows.length) {
    return (
      <section className="panel status-board">
        <header className="status-board-head" data-health="none">
          <span className="status-board-orb" aria-hidden><i /></span>
          <div className="min-w-0 flex-1">
            <p className="status-board-title">No services yet</p>
            <p className="status-board-sub">Deploy a project and its up / down history starts here, one bar per day.</p>
          </div>
        </header>
        <ul className="status-board-list" aria-hidden>
          {[0, 1].map((row) => (
            <li key={row} className="status-board-ghost">
              <div className="status-board-name"><b /><b /></div>
              <div className="uptime-bars">{Array.from({ length: 30 }, (_, index) => <span key={index} data-state="none" />)}</div>
              <div className="status-board-side"><b /></div>
            </li>
          ))}
        </ul>
      </section>
    )
  }
  const down = rows.filter((row) => row.health === "down").length
  const degraded = rows.filter((row) => row.health === "degraded").length
  const overall: Health = down ? "down" : degraded ? "degraded" : "up"
  return (
    <section className="panel status-board">
      <header className="status-board-head" data-health={overall}>
        <span className="status-board-orb" aria-hidden><i /></span>
        <div className="min-w-0 flex-1">
          <p className="status-board-title">{overall === "up" ? "All services operational" : overall === "degraded" ? `${degraded} service${degraded === 1 ? "" : "s"} degraded` : `${down} service${down === 1 ? "" : "s"} down`}</p>
          <p className="status-board-sub">{rows.length - down - degraded} up · {degraded} degraded · {down} down · release health over the last {DAYS} days</p>
        </div>
      </header>
      <ul className="status-board-list">
        {rows.map((row) => (
          <li key={row.project.id}>
            <div className="status-board-name">
              <Link href={`/projects/${row.project.id}`}>{row.project.name}<ArrowUpRight aria-hidden /></Link>
              <small>{row.detail}</small>
            </div>
            <UptimeBars days={row.days} label={row.project.name} />
            <div className="status-board-side">
              <HealthPill health={row.health} label={row.label} />
              <span className="status-board-uptime"><strong>{row.uptime === null ? "—" : `${row.uptime.toFixed(row.uptime === 100 ? 0 : 1)}%`}</strong>uptime</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One project's status: current health, uptime, and the 30-day strip. */
export function ProjectStatusCard({ state, project, now }: { state: AppState; project: Project; now: number }) {
  const row = projectHealth(state, project, now)
  return (
    <section className="panel status-card" data-health={row.health}>
      <div className="status-card-head">
        <span className="status-board-orb" aria-hidden><i /></span>
        <div className="min-w-0 flex-1">
          <p className="status-board-title">{row.label}</p>
          <p className="status-board-sub">{row.detail}</p>
        </div>
        <div className="status-card-uptime"><strong>{row.uptime === null ? "—" : `${row.uptime.toFixed(row.uptime === 100 ? 0 : 1)}%`}</strong><small>uptime · {DAYS} days</small></div>
      </div>
      <UptimeBars days={row.days} label={project.name} />
    </section>
  )
}
