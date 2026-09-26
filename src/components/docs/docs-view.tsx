"use client"

import Link from "next/link"
import { ArrowUpRight, BookOpen, Eye, FolderGit2, Rocket, ScanSearch, type LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { IconTile, ItemList, ItemRow, SectionHeading } from "@/components/ui/kit"

const STEPS: { title: string; body: string; icon: LucideIcon }[] = [
  { title: "Connect a source", body: "Import a GitHub repository or upload a project archive.", icon: FolderGit2 },
  { title: "Review the detection", body: "Arcellite Deploy reads the manifest and fills the build, start, and port.", icon: ScanSearch },
  { title: "Deploy", body: "The release runs on home-server and is reached at a local IP and port.", icon: Rocket },
  { title: "Watch it", body: "Logs, metrics, and alerts stay next to the project after it is ready.", icon: Eye },
]

const GUIDES = [
  { title: "Create your first project", body: "Pick a source and walk through detection and configuration.", href: "/projects/new" },
  { title: "Attach a domain", body: "Add a .local name for the LAN or a public hostname with DNS steps.", href: "/domains" },
  { title: "Read deployment logs", body: "Follow build output and runtime lines as they stream.", href: "/logs" },
  { title: "Ask Arc about your workspace", body: "Get a quick summary of what is running and what needs attention.", href: "/chat" },
]

export function DocsView() {
  return (
    <div className="page page-stack">
      <PageHeader
        icon={BookOpen}
        kicker="Help"
        title="Docs"
        description="How a project goes from source to a local endpoint. Phase 1 uses the mock provider."
        actions={<Link href="/projects/new" className="btn btn-primary"><Rocket aria-hidden />Deploy a project</Link>}
      />
      <section>
        <SectionHeading title="Quick start" />
        <ol className="docs-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card docs-step">
              <span className="docs-step-num" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
              <IconTile icon={step.icon} tone="brand" />
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <SectionHeading title="Guides" count={GUIDES.length} />
        <ItemList label="Guides">
          {GUIDES.map((guide) => (
            <ItemRow key={guide.href} href={guide.href} icon={BookOpen} tone="neutral" title={guide.title} subtitle={guide.body} trailing={<ArrowUpRight size={15} className="text-faint" aria-hidden />} />
          ))}
        </ItemList>
      </section>
    </div>
  )
}
