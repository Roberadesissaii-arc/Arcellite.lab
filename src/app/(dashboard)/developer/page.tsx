import type { Metadata } from "next"
import { DeveloperView } from "@/components/developer/developer-view"

export const metadata: Metadata = { title: "Developer tools" }

export default function Page() {
  return <DeveloperView />
}
