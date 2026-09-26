import type { Metadata } from "next"
import { Suspense } from "react"
import { NewProjectView } from "@/components/projects/new-project"
import { PageSkeleton } from "@/components/ui/bits"

export const metadata: Metadata = { title: "New project" }

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProjectView />
    </Suspense>
  )
}
