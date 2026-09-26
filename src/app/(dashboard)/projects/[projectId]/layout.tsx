import { ProjectFrame } from "@/components/projects/project-frame"

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <ProjectFrame>{children}</ProjectFrame>
}
