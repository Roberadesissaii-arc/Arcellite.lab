import type { Metadata } from "next"
import { PipelinesView } from "@/components/pipelines/pipelines-view"

export const metadata: Metadata = { title: "Pipelines" }

export default function Page() {
  return <PipelinesView />
}
