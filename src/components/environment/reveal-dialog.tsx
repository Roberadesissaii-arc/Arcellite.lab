"use client"

import { KeyRound } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/fields"
import { Modal } from "@/components/ui/overlays"
import { useDeploy } from "@/lib/deploy/react"
import { DeployError } from "@/lib/deploy/types"

interface Pending {
  projectId: string
  variableId: string
  key: string
  then: (value: string) => void
}

/**
 * Saved secrets from the control plane are write-only. Showing or copying one asks for the
 * current password each time; the value lives only in this component's memory afterwards.
 * Providers without `revealSecret` (the mock) keep values in the browser and skip this.
 */
export function useSecretReveal() {
  const deploy = useDeploy()
  const [values, setValues] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Pending | null>(null)

  const needsPassword = Boolean(deploy.revealSecret)

  function request(projectId: string, variable: { id: string; key: string }, then: (value: string) => void = () => {}) {
    const known = values[variable.id]
    if (known !== undefined) {
      then(known)
      return
    }
    setPending({ projectId, variableId: variable.id, key: variable.key, then })
  }

  function forget(variableId?: string) {
    setValues((current) => {
      if (!variableId) return {}
      const next = { ...current }
      delete next[variableId]
      return next
    })
  }

  const dialog = (
    <RevealDialog
      pending={pending}
      onClose={() => setPending(null)}
      onRevealed={(variableId, value) => {
        setValues((current) => ({ ...current, [variableId]: value }))
        pending?.then(value)
        setPending(null)
      }}
    />
  )

  return { needsPassword, values, request, forget, dialog }
}

function RevealDialog({ pending, onClose, onRevealed }: { pending: Pending | null; onClose: () => void; onRevealed: (variableId: string, value: string) => void }) {
  const deploy = useDeploy()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    setPassword("")
    setError(null)
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      icon={KeyRound}
      title={pending ? `Show ${pending.key}` : "Show secret"}
      description="Enter your password to show this secret. Each reveal is recorded in the audit log."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!pending || !deploy.revealSecret) return
          setBusy(true)
          setError(null)
          deploy
            .revealSecret(pending.projectId, pending.variableId, password)
            .then((value) => {
              setPassword("")
              setBusy(false)
              onRevealed(pending.variableId, value)
            })
            .catch((failure: unknown) => {
              setBusy(false)
              setError(failure instanceof DeployError ? failure.detail : "The secret could not be shown.")
            })
        }}
      >
        <Field label="Password" error={error ?? undefined}>
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} invalid={Boolean(error)} autoFocus required />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!password}>Show secret</Button>
        </div>
      </form>
    </Modal>
  )
}
