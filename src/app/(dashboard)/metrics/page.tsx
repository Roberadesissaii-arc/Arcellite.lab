import type { Metadata } from "next"
import { MetricsView } from "@/components/metrics/metrics-view"

export const metadata: Metadata = { title: "Metrics" }

export default function Page() {
  return <MetricsView />
}
