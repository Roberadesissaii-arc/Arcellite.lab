"use client"

import { Eye, EyeOff, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectInput, TextInput } from "@/components/ui/fields"
import type { EnvironmentName, EnvironmentVariable } from "@/lib/deploy/types"

function blank(): EnvironmentVariable {
  return {
    id: crypto.randomUUID(),
    key: "",
    value: "",
    secret: false,
    scope: "all",
  }
}

export function EnvEditor({
  value,
  onChange,
}: {
  value: EnvironmentVariable[]
  onChange: (next: EnvironmentVariable[]) => void
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Environment variables</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...value, blank()])}>
          <Plus aria-hidden />
          Add variable
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-muted">No variables yet. Secrets stay masked until you reveal them.</p>
      ) : (
        <ul className="space-y-3">
          {value.map((item, index) => (
            <li key={item.id} className="grid gap-2 md:grid-cols-[1fr_1.2fr_140px_auto_auto] md:items-center">
              <TextInput
                aria-label="Variable name"
                value={item.key}
                placeholder="KEY"
                onChange={(event) => update(index, { key: event.target.value.toUpperCase() })}
              />
              <TextInput
                aria-label={`Value for ${item.key || "variable"}`}
                type={item.secret && !visible[item.id] ? "password" : "text"}
                value={item.value}
                onChange={(event) => update(index, { value: event.target.value })}
              />
              <SelectInput
                aria-label="Scope"
                value={item.scope}
                onChange={(event) => update(index, { scope: event.target.value as EnvironmentVariable["scope"] })}
              >
                <option value="all">All environments</option>
                <option value="production">Production</option>
                <option value="preview">Preview</option>
                <option value="development">Development</option>
              </SelectInput>
              <button
                type="button"
                className="icon-btn"
                aria-pressed={item.secret}
                aria-label={item.secret ? "Mark as plain value" : "Mark as secret"}
                onClick={() => update(index, { secret: !item.secret })}
              >
                {item.secret ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </button>
              <button type="button" className="icon-btn" aria-label={`Remove ${item.key || "variable"}`} onClick={() => onChange(value.filter((row) => row.id !== item.id))}>
                <Trash2 aria-hidden />
              </button>
              {item.secret ? (
                <button type="button" className="text-left text-xs text-muted md:col-span-5" onClick={() => setVisible((current) => ({ ...current, [item.id]: !current[item.id] }))}>
                  {visible[item.id] ? "Hide secret" : "Reveal secret"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  function update(index: number, patch: Partial<EnvironmentVariable>) {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }
}

export function envError(variables: EnvironmentVariable[]): string | null {
  const keys = variables.map((item) => item.key.trim()).filter(Boolean)
  if (variables.some((item) => item.key.trim() && !/^[A-Z_][A-Z0-9_]*$/.test(item.key.trim()))) {
    return "Use uppercase letters, numbers, and underscores for variable names."
  }
  if (new Set(keys).size !== keys.length) return "Variable names must be unique."
  if (variables.some((item) => !item.key.trim() && (item.value || item.secret))) return "Name each variable before saving."
  return null
}

export const ENV_SCOPES: Array<EnvironmentVariable["scope"] | EnvironmentName> = ["all", "production", "preview", "development"]
