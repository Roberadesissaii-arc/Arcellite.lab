"use client"

import { PageHeader } from "@/components/page-header"
import { LogStream } from "@/components/logs/log-stream"
import { PageSkeleton } from "@/components/ui/bits"
import { useDeployState } from "@/lib/deploy/react"

export function LogsView() {
  const state = useDeployState()
  if (!state) return <PageSkeleton />
  return (
    <div className="page page-wide">
      <PageHeader title="Logs" description="Deployment output and runtime lines. Only the stream uses a monospace face." />
      <div className="mt-6">
        <LogStream target="all" allowTarget />
      </div>
    </div>
  )
}
