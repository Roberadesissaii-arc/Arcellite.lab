import type { Metadata } from "next"
import { ProjectDeployments } from "@/components/projects/project-panels"

export const metadata: Metadata = { title: "Deployments" }

export default function Page() {
  return <ProjectDeployments />
}
