"use client"

import { AlertTriangle, CircleAlert, Radio, Terminal } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { LogStream } from "@/components/logs/log-stream"
import { PageSkeleton } from "@/components/ui/bits"
import { StatCard, StatGrid } from "@/components/ui/kit"
import { useDeployState, useLogs } from "@/lib/deploy/react"
import { useNow } from "@/lib/use-now"

export function LogsView() {
  const state = useDeployState()
  // Refresh the counts on this interval; the provider decides which lines exist.
  useNow(5000)
  const lines = useLogs({ target: "all", level: "all", search: "" })
  if (!state) return <PageSkeleton />
  const warnings = lines.filter((line) => line.level === "warn").length
  const errors = lines.filter((line) => line.level === "error").length
  const sources = state.projects.length + state.containers.length + state.servers.length
  return (
    <div className="page page-wide page-stack">
      <PageHeader icon={Terminal} kicker="Observe" title="Logs" description="Deployment output and runtime lines from every project, container, and server." />
      <StatGrid>
        <StatCard icon={Terminal} tone="brand" label="Lines" value={lines.length} detail="In the current window" />
        <StatCard icon={AlertTriangle} tone={warnings ? "warning" : "neutral"} label="Warnings" value={warnings} detail={warnings ? "Worth a look" : "None recorded"} />
        <StatCard icon={CircleAlert} tone={errors ? "danger" : "success"} label="Errors" value={errors} detail={errors ? "Check the red lines" : "No errors"} />
        <StatCard icon={Radio} tone="info" label="Sources" value={sources} detail="Projects, containers, servers" />
      </StatGrid>
      <LogStream target="all" allowTarget insights />
    </div>
  )
}
