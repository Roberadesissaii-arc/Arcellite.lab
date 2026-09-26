import type { Metadata } from "next"
import { ProjectChat } from "@/components/chat/project-chat"
export const metadata: Metadata = { title: "Ask Arc" }
export default function Page() { return <ProjectChat /> }
