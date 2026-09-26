import type { Metadata } from "next"
import { JobsView } from "@/components/jobs/jobs-view"

export const metadata: Metadata = { title: "Jobs" }

export default function Page() {
  return <JobsView />
}
