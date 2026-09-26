import type { Metadata } from "next"
import { Suspense } from "react"
import { ContainersView } from "@/components/containers/containers-view"
import { PageSkeleton } from "@/components/ui/bits"

export const metadata: Metadata = { title: "Containers" }

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContainersView />
    </Suspense>
  )
}
