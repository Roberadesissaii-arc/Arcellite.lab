import { Shell } from "@/components/shell/shell"
import { DeployLifecycle } from "@/lib/deploy/react"
import { requirePageSession } from "@/server/auth/page-guard"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession()
  return (
    <>
      {session ? <DeployLifecycle /> : null}
      <Shell>{children}</Shell>
    </>
  )
}
