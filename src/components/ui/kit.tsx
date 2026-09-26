"use client"

import Link from "next/link"
import { createElement } from "react"
import {
  AlertTriangle, ArchiveRestore, ArrowRight, ArrowUpRight, Box, Boxes, CircleAlert, CircleCheck, CirclePlay, CircleUser, Clock, Cpu, Database,
  FolderKanban, GalleryVerticalEnd, GitBranch, Globe2, Hammer, HardDrive, Info, KeyRound, Layers, Loader, Lock, MemoryStick, Network, Radio,
  Rocket, Search, Server, ShieldCheck, Terminal, Unplug, type LucideIcon,
} from "lucide-react"
import {
  BadgeAlertIcon, BellIcon, BoxIcon, BoxesIcon, ChartPieIcon, CircleCheckIcon, ClockIcon, CpuIcon, DatabaseBackupIcon, DatabaseIcon, EarthIcon,
  FolderKanbanIcon, GalleryVerticalEndIcon, GitBranchIcon, HammerIcon, HardDriveDownloadIcon, KeyIcon, LayersIcon, LoaderCircleIcon, LockIcon,
  MonitorCheckIcon, PlayIcon, PlugZapIcon, RocketIcon, ShieldCheckIcon, TerminalIcon, UserIcon, WaypointsIcon, WifiIcon, ZapOffIcon,
} from "lucide-animated"
import { type AnimatedIcon, useIconAnimation } from "@/components/ui/animated-icon"
import { cn } from "@/lib/cn"

/** Animated stand-ins so every stat card's icon moves on hover, like the overview. */
const ANIMATED = new Map<LucideIcon, AnimatedIcon>([
  [AlertTriangle, BadgeAlertIcon],
  [ArchiveRestore, DatabaseBackupIcon],
  [Box, BoxIcon],
  [Boxes, BoxesIcon],
  [CircleAlert, ZapOffIcon],
  [CircleCheck, CircleCheckIcon],
  [CirclePlay, PlayIcon],
  [CircleUser, UserIcon],
  [Clock, ClockIcon],
  [Cpu, CpuIcon],
  [Database, DatabaseIcon],
  [FolderKanban, FolderKanbanIcon],
  [GalleryVerticalEnd, GalleryVerticalEndIcon],
  [GitBranch, GitBranchIcon],
  [Globe2, EarthIcon],
  [Hammer, HammerIcon],
  [HardDrive, HardDriveDownloadIcon],
  [Info, BellIcon],
  [KeyRound, KeyIcon],
  [Layers, LayersIcon],
  [Loader, LoaderCircleIcon],
  [Lock, LockIcon],
  [MemoryStick, ChartPieIcon],
  [Network, WaypointsIcon],
  [Radio, WifiIcon],
  [Rocket, RocketIcon],
  [Server, MonitorCheckIcon],
  [ShieldCheck, ShieldCheckIcon],
  [Terminal, TerminalIcon],
  [Unplug, PlugZapIcon],
])

export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "neutral"

/** Rounded icon badge used in stat cards, list rows, and page headers. */
export function IconTile({ icon: Icon, tone = "neutral", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  return <span className="icon-tile" data-tone={tone} data-size={size}><Icon aria-hidden /></span>
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("stat-grid", className)}>{children}</div>
}

/** KPI card matching the overview stat cards. Renders as a link when `href` is set. */
export function StatCard({
  label,
  value,
  detail,
  icon,
  animated,
  tone = "neutral",
  href,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  icon: LucideIcon
  /** Overrides the animated glyph picked for `icon`. */
  animated?: AnimatedIcon
  tone?: Tone
  href?: string
}) {
  const { ref, bind } = useIconAnimation()
  const Glyph = animated ?? ANIMATED.get(icon)
  const body = <>
    <span className="stat-card-head">
      <span>{label}</span>
      {Glyph ? <span className="icon-tile" data-tone={tone} data-size="sm">{createElement(Glyph, { ref, size: 14, className: "animated-glyph" })}</span> : <IconTile icon={icon} tone={tone} size="sm" />}
    </span>
    <strong className="stat-card-value"><span className="min-w-0 truncate">{value}</span>{href ? <ArrowUpRight aria-hidden /> : null}</strong>
    {detail ? <small className="stat-card-detail">{detail}</small> : null}
  </>
  return href ? <Link href={href} className="stat-card" data-link {...bind}>{body}</Link> : <div className="stat-card" {...bind}>{body}</div>
}

export function SectionHeading({
  title,
  count,
  href,
  action = "View all",
  aside,
}: {
  title: string
  count?: number
  href?: string
  action?: string
  aside?: React.ReactNode
}) {
  return (
    <div className="section-heading">
      <h2>{title}{count !== undefined ? <span className="section-count">{count}</span> : null}</h2>
      {href ? <Link href={href}>{action}<ArrowRight aria-hidden /></Link> : aside}
    </div>
  )
}

/**
 * List row with a leading icon tile, a title/subtitle block, optional meta
 * columns (hidden on narrow containers), and a trailing slot.
 */
export function ItemRow({
  icon,
  tone,
  title,
  subtitle,
  meta,
  metaWidths,
  trailing,
  href,
  onClick,
  children,
}: {
  icon: LucideIcon
  tone?: Tone
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode[]
  /** Fixed pixel widths for meta columns so rows align like a table. */
  metaWidths?: number[]
  trailing?: React.ReactNode
  href?: string
  onClick?: () => void
  children?: React.ReactNode
}) {
  const content = <>
    <IconTile icon={icon} tone={tone} />
    <span className="item-main">
      <span className="item-title">{title}</span>
      {subtitle ? <span className="item-subtitle">{subtitle}</span> : null}
    </span>
    {meta?.map((item, index) => <span key={index} className="item-meta" style={metaWidths?.[index] ? { width: metaWidths[index] } : undefined}>{item}</span>)}
    {trailing ? <span className="item-trailing">{trailing}</span> : null}
  </>
  const row = href
    ? <Link href={href} className="item-row" data-interactive>{content}</Link>
    : onClick
      ? <button type="button" className="item-row" data-interactive onClick={onClick}>{content}</button>
      : <div className="item-row">{content}</div>
  return <li className="item-li">{row}{children ? <div className="item-extra">{children}</div> : null}</li>
}

export function ItemList({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return <ul className={cn("panel item-list", className)} aria-label={label}>{children}</ul>
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="search-field">
      <Search aria-hidden />
      <span className="sr-only">{label}</span>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

/** Soft empty state inside a panel, with an icon tile. */
export function EmptyPanel({ icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="panel empty-panel">
      <IconTile icon={icon} tone="brand" size="lg" />
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Pill tag for small labels like environment, engine, or kind. */
export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className="tag" data-tone={tone}>{children}</span>
}

const DEPLOYMENT_TONE: Record<string, Tone> = {
  ready: "success",
  failed: "danger",
  canceled: "warning",
  stopped: "warning",
}

/** Icon-tile tone for a deployment status: in-flight work reads as brand. */
export function deploymentTone(status: string): Tone {
  return DEPLOYMENT_TONE[status] ?? "brand"
}

/** Twenty-segment bar, matching the overview server card. */
export function SegmentMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const tone = pct >= 92 ? "danger" : pct >= 80 ? "warning" : undefined
  return (
    <span className="segment-meter" data-tone={tone} role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: 20 }, (_, i) => <i key={i} data-filled={i < Math.ceil(pct / 5)} />)}
    </span>
  )
}
