import type { Metadata } from "next"
import { ProjectOverview } from "@/components/projects/project-panels"

export const metadata: Metadata = { title: "Project" }

export default function Page() {
  return <ProjectOverview />
}
