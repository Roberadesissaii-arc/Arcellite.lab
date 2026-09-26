import type { Metadata } from "next"
import { ProjectLogs } from "@/components/projects/project-panels"

export const metadata: Metadata = { title: "Logs" }

export default function Page() {
  return <ProjectLogs />
}
