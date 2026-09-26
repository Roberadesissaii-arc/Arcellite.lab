import type { Metadata } from "next"
import { ProjectEnvironment } from "@/components/projects/project-panels"

export const metadata: Metadata = { title: "Environment" }

export default function Page() {
  return <ProjectEnvironment />
}
