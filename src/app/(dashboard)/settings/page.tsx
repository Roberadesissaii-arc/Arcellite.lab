import type { Metadata } from "next"
import { Suspense } from "react"
import { SettingsView } from "@/components/settings/settings-view"
import { PageSkeleton } from "@/components/ui/bits"

export const metadata: Metadata = { title: "Settings" }

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <SettingsView />
    </Suspense>
  )
}
