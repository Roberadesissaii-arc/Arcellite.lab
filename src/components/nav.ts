import {
  Bell,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  Files,
  Globe2,
  HardDrive,
  Database,
  Gauge,
  GalleryVerticalEnd,
  LayoutDashboard,
  MonitorDot,
  PackagePlus,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Sparkle,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const NAV_GROUPS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/chat", label: "Ask Arc", icon: Sparkle },
      { href: "/projects", label: "Projects", icon: Files },
      { href: "/deployments", label: "Deployments", icon: PackagePlus },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    items: [
      { href: "/servers", label: "Servers", icon: Server },
      { href: "/containers", label: "Containers", icon: Boxes },
      { href: "/domains", label: "Domains", icon: Globe2 },
      { href: "/storage", label: "Storage", icon: HardDrive },
      { href: "/databases", label: "Databases", icon: Database },
    ],
  },
  {
    id: "observe",
    label: "Observe",
    items: [
      { href: "/logs", label: "Logs", icon: Terminal },
      { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
      { href: "/alerts", label: "Alerts", icon: ShieldCheck },
      { href: "/events", label: "Events", icon: GalleryVerticalEnd },
      { href: "/metrics", label: "Metrics", icon: Gauge },
      { href: "/activity", label: "Activity", icon: MonitorDot },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings }
export const DOCS_ITEM: NavItem = { href: "/docs", label: "Docs", icon: BookOpen }
export const NOTIFICATIONS_ITEM: NavItem = { href: "/notifications", label: "Notifications", icon: Bell }

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
