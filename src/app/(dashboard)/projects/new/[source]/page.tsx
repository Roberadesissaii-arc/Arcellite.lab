import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { NewProjectView } from "@/components/projects/new-project"
import { PageSkeleton } from "@/components/ui/bits"

const SOURCES = ["github", "upload", "git", "image", "compose"] as const
const TITLES: Record<(typeof SOURCES)[number], string> = { github: "Import from GitHub", upload: "Upload a project", git: "Git repository", image: "Docker image", compose: "Docker Compose" }

export function generateStaticParams() {
  return SOURCES.map((source) => ({ source }))
}

export async function generateMetadata({ params }: { params: Promise<{ source: string }> }): Promise<Metadata> {
  const { source } = await params
  return { title: TITLES[source as (typeof SOURCES)[number]] ?? "New project" }
}

export default async function Page({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params
  if (!(SOURCES as readonly string[]).includes(source)) notFound()
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProjectView source={source} />
    </Suspense>
  )
}
