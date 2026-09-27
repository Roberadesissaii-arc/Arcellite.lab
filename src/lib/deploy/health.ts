import { latestDeployment, projectBadge } from "./helpers"
import type { AppState, Health, HealthDayState, Project, ProjectHealth } from "./types"

const DAY = 24 * 60 * 60 * 1000
export const HEALTH_DAYS = 30

/**
 * Mock health: up / degraded / down with a 30-day history derived from release outcomes.
 * A failed release marks that day degraded; a stopped web container marks today down.
 * There is no probe here — a server provider reports observed health instead.
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
  const days = Array.from({ length: HEALTH_DAYS }, (_, index) => {
    const start = today.getTime() - (HEALTH_DAYS - 1 - index) * DAY
    const end = start + DAY
    if (end <= created) return { start, state: "none" as HealthDayState, note: "Not deployed yet" }
    const inDay = deployments.filter((item) => {
      const time = Date.parse(item.createdAt)
      return time >= start && time < end
    })
    const failed = inDay.filter((item) => item.status === "failed").length
    if (index === HEALTH_DAYS - 1 && health !== "up") return { start, state: health as HealthDayState, note: health === "down" ? "Not serving" : "Latest release failed" }
    if (failed) return { start, state: "degraded" as HealthDayState, note: `${failed} failed release${failed === 1 ? "" : "s"}` }
    return { start, state: "up" as HealthDayState, note: inDay.length ? `${inDay.length} release${inDay.length === 1 ? "" : "s"}, all healthy` : "Serving normally" }
  })
  const tracked = days.filter((day) => day.state !== "none")
  // Mock approximation: a degraded day counts as 98%. Real uptime comes from probe results.
  const uptime = tracked.length ? (tracked.reduce((sum, day) => sum + (day.state === "up" ? 1 : day.state === "degraded" ? 0.98 : 0), 0) / tracked.length) * 100 : null
  const label = health === "up" ? "Operational" : health === "degraded" ? "Degraded" : "Down"
  const detail = health === "up" ? "Serving the latest release" : health === "degraded" ? "Previous release still serving" : project.runtime === "stopped" ? "Web container stopped" : "No live release"
  return { projectId: project.id, health, label, detail, uptime, days }
}
