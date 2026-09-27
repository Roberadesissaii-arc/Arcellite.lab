import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthLayout } from "@/components/auth/auth-layout"
import { SetupForm } from "@/components/auth/auth-forms"
import { authPageRedirect } from "@/server/auth/page-guard"

export const metadata: Metadata = { title: "Set up" }

export default async function SetupPage() {
  const destination = await authPageRedirect("setup")
  if (destination) redirect(destination)
  return (
    <AuthLayout>
      <SetupForm />
    </AuthLayout>
  )
}
