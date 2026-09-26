import type { Metadata } from "next"
import { DocsView } from "@/components/docs/docs-view"

export const metadata: Metadata = { title: "Docs" }

export default function Page() {
  return <DocsView />
}
