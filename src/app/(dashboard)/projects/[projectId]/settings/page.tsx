import type { Metadata } from "next"
import { ProjectSettings } from "@/components/projects/project-panels"

export const metadata: Metadata = { title: "Project settings" }

export default function Page() {
  return <ProjectSettings />
}
