import type { Metadata } from "next"
import { ServerDetail } from "@/components/servers/server-detail"

export const metadata: Metadata = { title: "Server" }

export default function Page() {
  return <ServerDetail />
}
