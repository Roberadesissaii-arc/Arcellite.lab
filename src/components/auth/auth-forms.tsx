"use client"

import { CircleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { createApiClient } from "@/lib/api/client"
import { PASSWORD_MIN } from "@/lib/api/contracts/auth"
import { DeployError } from "@/lib/deploy/types"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/fields"

const client = createApiClient()

type FieldErrors = Record<string, string>

function fieldErrors(error: DeployError): FieldErrors {
  const issues = error.details?.issues
  if (!Array.isArray(issues)) return {}
  const result: FieldErrors = {}
  for (const issue of issues) {
    if (issue && typeof issue === "object" && "path" in issue && "message" in issue && typeof issue.path === "string" && typeof issue.message === "string") {
      result[issue.path] ??= issue.message
    }
  }
  return result
}

function useSubmit(path: string) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})

  async function submit(body: Record<string, string>) {
    setPending(true)
    setMessage(null)
    setErrors({})
    try {
      await client.request("POST", path, { body })
      // The dashboard layout re-checks the new session on the server before rendering.
      router.replace("/")
      router.refresh()
    } catch (error) {
      setPending(false)
      if (error instanceof DeployError) {
        const byField = fieldErrors(error)
        setErrors(byField)
        setMessage(Object.keys(byField).length ? null : error.detail)
      } else {
        setMessage("Something went wrong. Try again.")
      }
    }
  }

  return { pending, message, errors, submit }
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p className="auth-alert" role="alert">
      <CircleAlert aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function SetupForm() {
  const { pending, message, errors, submit } = useSubmit("/api/v1/auth/bootstrap")
  return (
    <>
      <p className="auth-kicker">First run</p>
      <h1 className="page-title">Create the owner account</h1>
      <p className="page-copy mt-2">This account owns the Arcellite Lab workspace. Setup runs once; later visitors sign in.</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          void submit({
            displayName: String(data.get("displayName") ?? ""),
            login: String(data.get("login") ?? ""),
            password: String(data.get("password") ?? ""),
            passwordConfirmation: String(data.get("passwordConfirmation") ?? ""),
          })
        }}
      >
        {message ? <Alert>{message}</Alert> : null}
        <Field label="Your name" error={errors.displayName}>
          <TextInput name="displayName" autoComplete="name" required invalid={Boolean(errors.displayName)} autoFocus />
        </Field>
        <Field label="Email or username" error={errors.login}>
          <TextInput name="login" autoComplete="username" required spellCheck={false} autoCapitalize="none" invalid={Boolean(errors.login)} />
        </Field>
        <Field label="Password" hint={`At least ${PASSWORD_MIN} characters. A passphrase works well.`} error={errors.password}>
          <TextInput name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} invalid={Boolean(errors.password)} />
        </Field>
        <Field label="Confirm password" error={errors.passwordConfirmation}>
          <TextInput name="passwordConfirmation" type="password" autoComplete="new-password" required invalid={Boolean(errors.passwordConfirmation)} />
        </Field>
        <Button type="submit" variant="primary" loading={pending}>Create owner account</Button>
      </form>
      <p className="auth-foot">Nothing from a browser demo is imported. The workspace starts empty.</p>
    </>
  )
}

export function LoginForm() {
  const { pending, message, submit } = useSubmit("/api/v1/auth/login")
  return (
    <>
      <p className="auth-kicker">Arcellite Lab</p>
      <h1 className="page-title">Sign in</h1>
      <p className="page-copy mt-2">Use the account created during setup.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          void submit({ login: String(data.get("login") ?? ""), password: String(data.get("password") ?? "") })
        }}
      >
        {message ? <Alert>{message}</Alert> : null}
        <Field label="Email or username">
          <TextInput name="login" autoComplete="username" required spellCheck={false} autoCapitalize="none" autoFocus />
        </Field>
        <Field label="Password">
          <TextInput name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" loading={pending}>Sign in</Button>
      </form>
    </>
  )
}
