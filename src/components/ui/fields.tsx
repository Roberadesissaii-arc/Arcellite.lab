"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/cn"

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function TextInput({
  invalid,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn("input", className)} aria-invalid={invalid || undefined} {...props} />
}

type Option = { value: string; label: string }
type OptionGroup = { label: string | null; options: Option[] }

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function readOptions(children: React.ReactNode): OptionGroup[] {
  const groups: OptionGroup[] = []
  const loose: Option[] = []
  const flush = () => {
    if (loose.length) groups.push({ label: null, options: loose.splice(0) })
  }
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: unknown; label?: string; children?: React.ReactNode }>(child)) return
    if (child.type === "option") {
      const label = textOf(child.props.children)
      loose.push({ value: String(child.props.value ?? label), label })
    } else if (child.type === "optgroup") {
      flush()
      groups.push({ label: child.props.label ?? null, options: readOptions(child.props.children).flatMap((group) => group.options) })
    }
  })
  flush()
  return groups
}

/**
 * Styled dropdown with the same call shape as a native select: `<option>` and
 * `<optgroup>` children, `value`/`defaultValue`, `name` for forms, and an
 * `onChange` that receives `{ target: { value } }`.
 */
export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, className, children, value, defaultValue, onChange, name, disabled, id } = props
  const groups = React.useMemo(() => readOptions(children), [children])
  const options = groups.flatMap((group) => group.options)
  const [inner, setInner] = React.useState(() => String(defaultValue ?? options[0]?.value ?? ""))
  const current = value !== undefined ? String(value) : inner
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]))
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  // Inside a modal dialog, portal the menu into the dialog so its focus trap
  // and outside-click handling treat the menu as part of the dialog.
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  return (
    <SelectPrimitive.Root
      onOpenChange={(open) => {
        if (open) setContainer(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null)
      }}
      value={current}
      items={items}
      name={name}
      disabled={disabled}
      onValueChange={(next) => {
        if (next == null) return
        const nextValue = String(next)
        if (value === undefined) setInner(nextValue)
        onChange?.({ target: { value: nextValue, name }, currentTarget: { value: nextValue, name } } as unknown as React.ChangeEvent<HTMLSelectElement>)
      }}
    >
      <SelectPrimitive.Trigger
        ref={triggerRef}
        id={id}
        aria-label={props["aria-label"]}
        aria-invalid={invalid || undefined}
        className={cn("select-trigger", className)}
      >
        <SelectPrimitive.Value className="select-trigger-value" />
        <SelectPrimitive.Icon className="select-trigger-icon"><ChevronDown aria-hidden /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container ?? undefined}>
        <SelectPrimitive.Positioner className="select-positioner" sideOffset={6} alignItemWithTrigger={false}>
          <SelectPrimitive.Popup className="workspace-surface select-popup">
            <SelectPrimitive.List className="select-list">
              {groups.map((group, index) => group.label ? (
                <SelectPrimitive.Group key={group.label + index} className="select-group">
                  <SelectPrimitive.GroupLabel className="select-group-label">{group.label}</SelectPrimitive.GroupLabel>
                  {group.options.map((option) => <Item key={option.value} option={option} />)}
                </SelectPrimitive.Group>
              ) : group.options.map((option) => <Item key={option.value} option={option} />))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

function Item({ option }: { option: Option }) {
  return (
    <SelectPrimitive.Item value={option.value} className="select-item">
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">{option.label}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="select-item-check"><Check aria-hidden /></SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />
}
