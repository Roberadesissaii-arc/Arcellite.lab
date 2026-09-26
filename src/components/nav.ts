import {
  Bell,
  BookOpen,
  Boxes,
  Files,
  Globe2,
  HardDrive,
  Database,
  Gauge,
  GalleryVerticalEnd,
  KeyRound,
  LayoutDashboard,
  MonitorDot,
  PackagePlus,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Sparkle,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import {
  ActivityIcon,
  BellIcon,
  BookTextIcon,
  BoxesIcon,
  DatabaseIcon,
  EarthIcon,
  FolderKanbanIcon,
  GalleryVerticalEndIcon,
  GaugeIcon,
  HardDriveUploadIcon,
  KeySquareIcon,
  LayoutGridIcon,
  RocketIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  WorkflowIcon,
} from "lucide-animated"

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export type AnimatedIcon = React.ForwardRefExoticComponent<
  { size?: number; className?: string; animateOnHover?: boolean } & React.RefAttributes<AnimatedIconHandle>
>

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Motion-driven version played while the link is hovered or focused. */
  animated?: AnimatedIcon
}

export const NAV_GROUPS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, animated: LayoutGridIcon },
      { href: "/chat", label: "Ask Arc", icon: Sparkle, animated: SparklesIcon },
      { href: "/projects", label: "Projects", icon: Files, animated: FolderKanbanIcon },
      { href: "/deployments", label: "Deployments", icon: PackagePlus, animated: RocketIcon },
      { href: "/environment", label: "Environment", icon: KeyRound, animated: KeySquareIcon },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    items: [
      { href: "/servers", label: "Servers", icon: Server },
      { href: "/containers", label: "Containers", icon: Boxes, animated: BoxesIcon },
      { href: "/domains", label: "Domains", icon: Globe2, animated: EarthIcon },
      { href: "/storage", label: "Storage", icon: HardDrive, animated: HardDriveUploadIcon },
      { href: "/databases", label: "Databases", icon: Database, animated: DatabaseIcon },
    ],
  },
  {
    id: "observe",
    label: "Observe",
    items: [
      { href: "/logs", label: "Logs", icon: Terminal, animated: TerminalIcon },
      { href: "/jobs", label: "Jobs", icon: Workflow, animated: WorkflowIcon },
      { href: "/alerts", label: "Alerts", icon: ShieldCheck, animated: ShieldCheckIcon },
      { href: "/events", label: "Events", icon: GalleryVerticalEnd, animated: GalleryVerticalEndIcon },
      { href: "/metrics", label: "Metrics", icon: Gauge, animated: GaugeIcon },
      { href: "/activity", label: "Activity", icon: MonitorDot, animated: ActivityIcon },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, animated: SettingsIcon }
export const DOCS_ITEM: NavItem = { href: "/docs", label: "Docs", icon: BookOpen, animated: BookTextIcon }
export const NOTIFICATIONS_ITEM: NavItem = { href: "/notifications", label: "Notifications", icon: Bell, animated: BellIcon }

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
