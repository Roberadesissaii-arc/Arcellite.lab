"use client"

import { Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { KeyGlyph } from "@/components/environment/key-glyph"
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
  title = "Environment variables",
}: {
  value: EnvironmentVariable[]
  onChange: (next: EnvironmentVariable[]) => void
  title?: string
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const reduced = useReducedMotion()
  const keys = value.map((item) => item.key.trim()).filter(Boolean)
  return (
    <div className="ee">
      <div className="ee-head">
        <div className="min-w-0">
          <h3>{title}</h3>
          <p>{value.length ? `${value.length} variable${value.length === 1 ? "" : "s"} · secrets stay masked until you reveal them` : "Secrets stay masked until you reveal them."}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, blank()])}>
          <Plus aria-hidden />
          Add variable
        </Button>
      </div>
      {value.length === 0 ? (
        <button type="button" className="ee-empty" onClick={() => onChange([blank()])}>
          <span className="ee-empty-icon"><Plus aria-hidden /></span>
          <strong>Add the first variable</strong>
          <small>DATABASE_URL, API keys, feature flags…</small>
        </button>
      ) : (
        <ul className="ee-list">
          <li className="ee-row ee-row-head" aria-hidden><span /><span>Name</span><span>Value</span><span>Scope</span><span /></li>
          <AnimatePresence initial={false}>
            {value.map((item, index) => {
              const name = item.key.trim()
              const invalid = Boolean(name) && (!/^[A-Z_][A-Z0-9_]*$/.test(name) || keys.filter((key) => key === name).length > 1)
              return (
                <motion.li
                  key={item.id}
                  className="ee-row"
                  data-invalid={invalid || undefined}
                  layout={!reduced}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                >
                  <KeyGlyph name={item.key} secret={item.secret} />
                  <TextInput
                    aria-label="Variable name"
                    className="ee-key"
                    value={item.key}
                    placeholder="KEY_NAME"
                    spellCheck={false}
                    onChange={(event) => update(index, { key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                  />
                  <div className="ee-value">
                    <TextInput
                      aria-label={`Value for ${item.key || "variable"}`}
                      type={item.secret && !visible[item.id] ? "password" : "text"}
                      value={item.value}
                      placeholder={item.stored && !item.value ? "Saved · type to replace" : "value"}
                      spellCheck={false}
                      onChange={(event) => update(index, { value: event.target.value })}
                    />
                    {item.secret && !(item.stored && !item.value) ? (
                      <button type="button" className="ee-reveal" aria-label={visible[item.id] ? "Hide value" : "Reveal value"} onClick={() => setVisible((current) => ({ ...current, [item.id]: !current[item.id] }))}>
                        {visible[item.id] ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                      </button>
                    ) : null}
                  </div>
                  <div className="ee-scope">
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
                  </div>
                  <div className="ee-actions">
                    <button
                      type="button"
                      className="ee-secret"
                      data-on={item.secret}
                      aria-pressed={item.secret}
                      title={item.secret ? "Secret — masked and redacted" : "Plain value"}
                      onClick={() => update(index, { secret: !item.secret })}
                    >
                      {item.secret ? <Lock aria-hidden /> : <LockOpen aria-hidden />}<span>{item.secret ? "Secret" : "Plain"}</span>
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Remove ${item.key || "variable"}`} onClick={() => onChange(value.filter((row) => row.id !== item.id))}>
                      <Trash2 aria-hidden />
                    </button>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
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
