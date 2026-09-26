import type { Metadata } from "next"
import { DeploymentDetail } from "@/components/deployments/deployment-detail"

export const metadata: Metadata = { title: "Deployment" }

export default function Page() {
  return <DeploymentDetail />
}
