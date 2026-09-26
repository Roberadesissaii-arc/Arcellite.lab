"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowDownToLine, Copy, Download, Pause, Play, TerminalSquare } from "lucide-react"
import { copyText } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { SearchField } from "@/components/ui/kit"
import { useToast } from "@/components/ui/toast"
import { formatClock } from "@/lib/deploy/format"
import { collectLogs } from "@/lib/deploy/logs"
import { useDeployState } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"
import type { AppState, LogEntry, LogLevel, LogQuery } from "@/lib/deploy/types"

const LEVELS: { value: LogLevel | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "debug", label: "Debug" },
]

function sourceName(state: AppState, row: LogEntry): string {
  if (row.targetType === "container") return state.containers.find((item) => item.id === row.targetId)?.name ?? "container"
  if (row.targetType === "server") return state.servers.find((item) => item.id === row.targetId)?.name ?? "server"
  const project = state.projects.find((item) => item.id === (row.projectId ?? row.targetId))
  return project ? project.slug || project.name : row.targetType
}

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
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null)
  const [follow, setFollow] = useState(true)
  const [chosen, setChosen] = useState(`${target}:${id ?? ""}`)
  const streamRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  const resolved = useMemo(() => {
    const [kind, value] = chosen.split(":")
    return { target: (kind || target) as LogQuery["target"], id: value || id }
  }, [chosen, target, id])

  const everything = state ? collectLogs(state, { target: resolved.target, id: resolved.id, level: "all", search }, now) : []
  const live = level === "all" ? everything : everything.filter((row) => row.level === level)
  const rows = paused && frozen ? frozen : live
  const counts = { all: everything.length, info: 0, warn: 0, error: 0, debug: 0 } as Record<LogLevel | "all", number>
  for (const row of everything) counts[row.level] += 1
  const showSource = resolved.target === "all"

  useEffect(() => {
    if (follow && !paused && streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [rows.length, follow, paused])

  if (!state) return null
  const text = () => rows.map((row) => `${formatClock(row.timestamp)} ${row.level.toUpperCase().padEnd(5)} ${row.message}`).join("\n")

  return (
    <div className="log-console">
      <div className="log-toolbar">
        {allowTarget ? (
          <SelectInput aria-label="Log source" value={chosen} onChange={(event) => setChosen(event.target.value)} className="log-source">
            <option value="all:">All sources</option>
            <optgroup label="Projects">
              {state.projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}
            </optgroup>
            <optgroup label="Containers">
              {state.containers.map((container) => <option key={container.id} value={`container:${container.id}`}>{container.name}</option>)}
            </optgroup>
            <optgroup label="Servers">
              {state.servers.map((server) => <option key={server.id} value={`server:${server.id}`}>{server.name}</option>)}
            </optgroup>
          </SelectInput>
        ) : null}
        <SearchField value={search} onChange={setSearch} placeholder="Search messages" label="Search logs" />
        <div className="segmented log-levels" role="group" aria-label="Filter by level">
          {LEVELS.map((item) => (
            <button key={item.value} type="button" aria-pressed={level === item.value} onClick={() => setLevel(item.value)}>
              {item.value !== "all" ? <span className="log-dot" data-level={item.value} aria-hidden /> : null}
              {item.label}
              <span className="log-count">{counts[item.value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="log-window">
        <div className="log-window-bar">
          <span className="log-window-title"><TerminalSquare aria-hidden />{showSource ? "All sources" : resolved.target}</span>
          <span className="log-live" data-paused={paused}>{paused ? "Paused" : "Live"}</span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className="log-tool"
              aria-label={paused ? "Resume stream" : "Pause stream"}
              title={paused ? "Resume" : "Pause"}
              onClick={() => {
                if (paused) { setFrozen(null); setPaused(false); return }
                setFrozen(live)
                setPaused(true)
              }}
            >
              {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            </button>
            <button type="button" className="log-tool" aria-pressed={follow} aria-label="Follow the newest line" title={follow ? "Following tail" : "Follow tail"} onClick={() => setFollow((value) => !value)}>
              <ArrowDownToLine aria-hidden />
            </button>
            <button type="button" className="log-tool" aria-label="Copy lines" title="Copy" onClick={() => void copyText(text()).then((ok) => toast(ok ? { title: "Logs copied" } : { title: "Could not copy", tone: "danger" }))}>
              <Copy aria-hidden />
            </button>
            <button
              type="button"
              className="log-tool"
              aria-label="Download lines"
              title="Download .log"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([text()], { type: "text/plain" }))
                const link = document.createElement("a")
                link.href = url
                link.download = `arcellite-${resolved.target}.log`
                link.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download aria-hidden />
            </button>
          </span>
        </div>
        <div className="log-stream-wrap">
        <div
          ref={streamRef}
          className="log-surface log-stream"
          role="log"
          tabIndex={0}
          aria-live={paused ? "off" : "polite"}
          onScroll={(event) => {
            const el = event.currentTarget
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
            setAtBottom(bottom)
            setFollow(bottom)
          }}
        >
          {rows.length === 0 ? <p className="log-empty">No log lines match. Try another level or search.</p> : null}
          {rows.map((row, index) => (
            <div key={row.id} className="log-row" data-level={row.level}>
              <span className="log-num" aria-hidden>{index + 1}</span>
              <span className="log-time">{formatClock(row.timestamp)}</span>
              <span className="log-level">{row.level}</span>
              {showSource ? <span className="log-src">{sourceName(state, row)}</span> : null}
              <span className="log-msg">{row.message}</span>
            </div>
          ))}
        </div>
        {!atBottom ? (
          <button
            type="button"
            className="log-jump pressable"
            aria-label="Jump to the newest line"
            onClick={() => {
              const el = streamRef.current
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
              setFollow(true)
            }}
          >
            <ArrowDown aria-hidden />
          </button>
        ) : null}
        </div>
        <div className="log-window-foot">
          <span>{rows.length} lines</span>
          <span className="log-dot" data-level="warn" aria-hidden />{counts.warn} {counts.warn === 1 ? "warning" : "warnings"}
          <span className="log-dot" data-level="error" aria-hidden />{counts.error} {counts.error === 1 ? "error" : "errors"}
          {paused ? <span className="ml-auto">New lines are held until you resume.</span> : <span className="ml-auto">{follow ? "Following the newest line" : "Scroll lock on"}</span>}
        </div>
      </div>
    </div>
  )
}
