import type { Metadata } from "next"
import { EnvironmentView } from "@/components/environment/environment-view"

export const metadata: Metadata = { title: "Environment" }

export default function Page() {
  return <EnvironmentView />
}
