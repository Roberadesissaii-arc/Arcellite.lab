import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthLayout } from "@/components/auth/auth-layout"
import { LoginForm } from "@/components/auth/auth-forms"
import { authPageRedirect } from "@/server/auth/page-guard"

export const metadata: Metadata = { title: "Sign in" }

export default async function LoginPage() {
  const destination = await authPageRedirect("login")
  if (destination) redirect(destination)
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  )
}
