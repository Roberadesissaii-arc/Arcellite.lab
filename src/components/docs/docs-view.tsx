"use client"

import { PageHeader } from "@/components/page-header"

const STEPS = [
  { title: "Connect a source", body: "Import a GitHub repository or upload a project archive." },
  { title: "Review the detection", body: "Arcellite Deploy reads the manifest and fills the build, start, and port." },
  { title: "Deploy", body: "The release runs on home-server and is reached at a local IP and port." },
  { title: "Watch it", body: "Logs, metrics, and alerts stay next to the project after it is ready." },
]

export function DocsView() {
  return (
    <div className="page">
      <PageHeader
        title="Docs"
        description="How a project goes from source to a local endpoint. Phase 1 uses the mock provider."
      />
      <ol className="panel mt-6 divide-y divide-zinc-200">
        {STEPS.map((step, index) => (
          <li key={step.title} className="px-4 py-4">
            <p className="text-sm font-semibold text-zinc-900">
              {index + 1}. {step.title}
            </p>
            <p className="mt-1 text-sm text-zinc-600">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
