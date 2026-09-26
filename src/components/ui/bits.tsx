"use client"

import { Check, Copy } from "lucide-react"
import { useId, useState } from "react"
import { cn } from "@/lib/cn"

export function Meter({
  value,
  max = 100,
  tone,
  label,
}: {
  value: number
  max?: number
  tone?: "warning" | "danger"
  label: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const auto = pct >= 92 ? "danger" : pct >= 80 ? "warning" : tone
  return (
    <div className="meter" data-tone={auto} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="py-16">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <p className="page-copy mt-2">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />
}

export function PageSkeleton() {
  return (
    <div className="page" aria-hidden>
      <SkeletonBlock className="h-4 w-32" />
      <SkeletonBlock className="mt-4 h-9 w-64" />
      <SkeletonBlock className="mt-3 h-4 w-80" />
      <div className="mt-10 space-y-3">
        <SkeletonBlock className="h-14 w-full" />
        <SkeletonBlock className="h-14 w-full" />
        <SkeletonBlock className="h-14 w-full" />
      </div>
    </div>
  )
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export function CopyButton({
  value,
  label = "Copy",
  onCopied,
}: {
  value: string
  label?: string
  onCopied?: (ok: boolean) => void
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm pressable"
      onClick={async () => {
        const ok = await copyText(value)
        onCopied?.(ok)
        if (!ok) return
        setDone(true)
        window.setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      {done ? "Copied" : label}
    </button>
  )
}

export function Sparkline({
  values,
  label,
  format,
  tall = false,
}: {
  values: number[]
  label: string
  format: (value: number) => string
  tall?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const gradientId = useId()
  if (values.length < 2) return <p className="text-sm text-faint">No samples yet.</p>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const width = 320
  const height = tall ? 120 : 64
  const step = width / (values.length - 1)
  const coords = values.map((value, index) => [index * step, height - ((value - min) / span) * (height - 12) - 6] as const)
  const points = coords.map(([x, y]) => `${x},${y}`).join(" ")
  const area = `M0,${height} L${coords.map(([x, y]) => `${x},${y}`).join(" L")} L${width},${height} Z`
  const active = hover ?? values.length - 1
  const activeValue = values[active] ?? values[values.length - 1]
  const [ax, ay] = coords[active] ?? coords[coords.length - 1]
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={tall ? "h-[120px] w-full overflow-visible" : "h-16 w-full overflow-visible"}
        role="img"
        aria-label={label}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientX - rect.left) / rect.width
          setHover(Math.max(0, Math.min(values.length - 1, Math.round(ratio * (values.length - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <polyline fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={points} className="text-brand" />
        {hover != null ? <line x1={ax} x2={ax} y1={0} y2={height} stroke="var(--border-strong)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <span className="sparkline-dot" style={{ left: `${(ax / width) * 100}%`, top: ay }} aria-hidden />
      <p className="mt-2 text-xs text-muted tabular-nums">
        {hover == null ? "Now" : `${values.length - 1 - hover}h ago`} · {format(activeValue)}
      </p>
    </div>
  )
}
