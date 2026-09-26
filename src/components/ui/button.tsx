"use client"

import { Slot } from "@radix-ui/react-slot"
import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/cn"

type Variant = "primary" | "secondary" | "ghost" | "danger"

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: "md" | "sm"
  loading?: boolean
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn("btn pressable", `btn-${variant}`, size === "sm" && "btn-sm", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </Comp>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={cn("icon-btn pressable", className)} aria-label={label} {...props}>
      {children}
    </button>
  )
}
