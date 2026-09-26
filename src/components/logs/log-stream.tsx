"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { copyText } from "@/components/ui/bits"
import { SelectInput, TextInput } from "@/components/ui/fields"
import { useToast } from "@/components/ui/toast"
import { formatClock } from "@/lib/deploy/format"
import { collectLogs } from "@/lib/deploy/logs"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import type { LogLevel, LogQuery } from "@/lib/deploy/types"

export function LogStream({
  target,
  id,
  allowTarget = false,
}: {
  target: LogQuery["target"]
  id?: string
  allowTarget?: boolean
}) {
  const state = useDeployState()
  const now = useNow(1000)
  const toast = useToast()
  const [level, setLevel] = useState<LogLevel | "all">("all")
  const [search, setSearch] = useState("")
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<ReturnType<typeof collectLogs> | null>(null)
  const [follow, setFollow] = useState(true)
  const [chosen, setChosen] = useState(`${target}:${id ?? ""}`)
  const endRef = useRef<HTMLDivElement>(null)

  const resolved = useMemo(() => {
    const [kind, value] = chosen.split(":")
    return { target: (kind || target) as LogQuery["target"], id: value || id }
  }, [chosen, target, id])

  const live = state ? collectLogs(state, { target: resolved.target, id: resolved.id, level, search }, now) : []
  const rows = paused && frozen ? frozen : live

  useEffect(() => {
    if (follow && !paused) {
      const stream = endRef.current?.parentElement
      if (stream) stream.scrollTop = stream.scrollHeight
    }
  }, [rows.length, follow, paused])

  if (!state) return null

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {allowTarget ? (
          <SelectInput aria-label="Log source" value={chosen} onChange={(event) => setChosen(event.target.value)} className="max-w-xs">
            <option value="all:">All sources</option>
            {state.projects.map((project) => (
              <option key={project.id} value={`project:${project.id}`}>Project · {project.name}</option>
            ))}
            {state.containers.map((container) => (
              <option key={container.id} value={`container:${container.id}`}>Container · {container.name}</option>
            ))}
            {state.servers.map((server) => (
              <option key={server.id} value={`server:${server.id}`}>Server · {server.name}</option>
            ))}
          </SelectInput>
        ) : null}
        <SelectInput aria-label="Level" value={level} onChange={(event) => setLevel(event.target.value as LogLevel | "all")} className="max-w-[140px]">
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </SelectInput>
        <TextInput aria-label="Search logs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search logs" className="max-w-xs" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (paused) {
              setFrozen(null)
              setPaused(false)
              return
            }
            setFrozen(live)
            setPaused(true)
          }}
        >
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-pressed={follow} onClick={() => setFollow((value) => !value)}>{follow ? "Following" : "Follow tail"}</Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const text = rows.map((row) => `${formatClock(row.timestamp)} ${row.level} ${row.message}`).join("\n")
            void copyText(text).then((ok) => toast(ok ? { title: "Logs copied" } : { title: "Could not copy", tone: "danger" }))
          }}
        >
          Copy
        </Button>
      </div>
      <div className="log-surface mt-4 max-h-[560px] overflow-auto rounded-[var(--radius-panel)] px-4 py-3">
        {rows.length === 0 ? <p className="text-sm text-muted">No log lines for this source.</p> : null}
        {rows.map((row) => (
          <div key={row.id} className={`log-line ${row.level === "warn" ? "log-warn" : row.level === "error" ? "log-error" : row.level === "debug" ? "log-debug" : ""}`}>
            <span className="text-faint tabular-nums">{formatClock(row.timestamp)}</span>
            <span className="uppercase">{row.level}</span>
            <span className="whitespace-pre-wrap break-words">{row.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {paused ? <p className="mt-2 text-xs text-faint">Paused. New lines are held until you resume.</p> : null}
    </div>
  )
}
