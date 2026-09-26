import type { Metadata } from "next"
import { ProjectChat } from "@/components/chat/project-chat"
export const metadata: Metadata = { title: "Project chat" }
export default function Page() { return <ProjectChat /> }
