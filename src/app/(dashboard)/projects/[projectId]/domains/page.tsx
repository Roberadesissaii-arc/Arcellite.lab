import type { Metadata } from "next"
import { ProjectDomains } from "@/components/projects/project-panels"

export const metadata: Metadata = { title: "Domains" }

export default function Page() {
  return <ProjectDomains />
}
