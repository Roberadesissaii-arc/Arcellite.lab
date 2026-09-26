"use client"

import { useState } from "react"
import { formatDuration } from "@/lib/deploy/format"
import type { Deployment } from "@/lib/deploy/types"

const DAY = 24 * 60 * 60 * 1000

interface DayBucket {
  key: string
  label: string
  full: string
  total: number
  ready: number
  failed: number
}

function buckets(deployments: Deployment[], now: number): DayBucket[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, index) => {
    const start = today.getTime() - (6 - index) * DAY
    const end = start + DAY
    const inDay = deployments.filter((item) => {
      const time = Date.parse(item.createdAt)
      return time >= start && time < end
    })
    const date = new Date(start)
    return {
      key: date.toISOString(),
      label: index === 6 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" }),
      full: date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
      total: inDay.length,
      ready: inDay.filter((item) => item.status === "ready").length,
      failed: inDay.filter((item) => item.status === "failed").length,
    }
  })
}

/** Single-series bar chart of releases per day for the last seven days. */
export function ReleaseChart({ deployments, now }: { deployments: Deployment[]; now: number }) {
  const [active, setActive] = useState<number | null>(null)
  const days = buckets(deployments, now)
  // Even ceiling so the middle gridline is a whole number.
  const max = Math.max(2, Math.ceil(Math.max(...days.map((day) => day.total)) / 2) * 2)
  const week = days.reduce((sum, day) => sum + day.total, 0)
  const ready = days.reduce((sum, day) => sum + day.ready, 0)
  const weekStart = now - 7 * DAY
  const finished = deployments.filter((item) => item.finishedAt && Date.parse(item.createdAt) >= weekStart)
  const avg = finished.length ? finished.reduce((sum, item) => sum + (Date.parse(item.finishedAt!) - Date.parse(item.createdAt)), 0) / finished.length : 0
  const focus = active ?? 6
  const focused = days[focus]

  return (
    <div className="panel release-chart">
      <div className="release-chart-head">
        <div>
          <p className="release-chart-value">{week}<small> releases</small></p>
          <p className="release-chart-sub">{week ? `${Math.round((ready / week) * 100)}% ready` : "No releases"} · average build {avg ? formatDuration(avg) : "—"}</p>
        </div>
        <div className="release-chart-focus" aria-live="polite">
          <strong>{focused.total}</strong>
          <span>{focused.full}</span>
        </div>
      </div>
      <div className="release-chart-plot" role="img" aria-label={`Releases per day for the last 7 days: ${days.map((day) => `${day.label} ${day.total}`).join(", ")}`}>
        <div className="release-chart-grid" aria-hidden>
          <span data-value={max} />
          <span data-value={max / 2} />
          <span data-value={0} />
        </div>
        <div className="release-chart-bars">
          {days.map((day, index) => (
            <button
              key={day.key}
              type="button"
              className="release-chart-col"
              data-active={focus === index}
              aria-label={`${day.full}: ${day.total} release${day.total === 1 ? "" : "s"}, ${day.ready} ready, ${day.failed} failed`}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <span className="release-chart-bar" style={{ height: `${(day.total / max) * 100}%` }} data-empty={day.total === 0} />
              {active === index ? (
                <span className="release-chart-tip" role="tooltip">
                  <strong>{day.total} release{day.total === 1 ? "" : "s"}</strong>
                  <span>{day.ready} ready{day.failed ? ` · ${day.failed} failed` : ""}</span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="release-chart-axis" aria-hidden>
        {days.map((day) => <span key={day.key}>{day.label}</span>)}
      </div>
    </div>
  )
}
