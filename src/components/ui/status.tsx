import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Circle,
  CircleAlert,
  Clock,
  FolderUp,
  Hammer,
  Radio,
  RotateCcw,
  Square,
  Unplug,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import type { ContainerState, DeploymentStatus, DomainStatus, ServerStatus } from "@/lib/deploy/types"

type Tone = "success" | "warning" | "danger" | "info" | "neutral"

export function Status({
  tone,
  icon: Icon,
  label,
}: {
  tone: Tone
  icon: LucideIcon
  label: string
}) {
  return (
    <span className={`status status-${tone}`}>
      <Icon aria-hidden />
      <span>{label}</span>
    </span>
  )
}

const deployment: Record<DeploymentStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  ready: { tone: "success", icon: Check, label: "Ready" },
  building: { tone: "info", icon: Hammer, label: "Building" },
  queued: { tone: "info", icon: Clock, label: "Queued" },
  preparing: { tone: "info", icon: FolderUp, label: "Preparing" },
  deploying: { tone: "info", icon: ArrowUpRight, label: "Deploying" },
  failed: { tone: "danger", icon: CircleAlert, label: "Failed" },
  canceled: { tone: "warning", icon: X, label: "Canceled" },
  stopped: { tone: "warning", icon: Square, label: "Stopped" },
}

const server: Record<ServerStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  online: { tone: "success", icon: Radio, label: "Online" },
  degraded: { tone: "warning", icon: AlertTriangle, label: "Degraded" },
  offline: { tone: "danger", icon: Unplug, label: "Offline" },
}

const container: Record<ContainerState, { tone: Tone; icon: LucideIcon; label: string }> = {
  running: { tone: "success", icon: Check, label: "Running" },
  starting: { tone: "info", icon: Clock, label: "Starting" },
  restarting: { tone: "info", icon: RotateCcw, label: "Restarting" },
  stopped: { tone: "warning", icon: Square, label: "Stopped" },
  exited: { tone: "danger", icon: XCircle, label: "Exited" },
}

const domain: Record<DomainStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  active: { tone: "success", icon: Check, label: "Active" },
  pending: { tone: "warning", icon: Clock, label: "Pending" },
  "dns-required": { tone: "warning", icon: Clock, label: "DNS required" },
  verifying: { tone: "info", icon: Radio, label: "Verifying" },
  issuing: { tone: "info", icon: Radio, label: "Issuing certificate" },
  invalid: { tone: "danger", icon: CircleAlert, label: "Invalid" },
}

/** `neverDeployed` is for providers without deployments: the project exists but nothing has run. */
export function DeploymentStatusView({ value, neverDeployed = false }: { value: DeploymentStatus; neverDeployed?: boolean }) {
  if (neverDeployed) return <Status tone="neutral" icon={Circle} label="Not deployed" />
  const item = deployment[value]
  return <Status {...item} />
}

export function ServerStatusView({ value }: { value: ServerStatus }) {
  return <Status {...server[value]} />
}

export function ContainerStatusView({ value }: { value: ContainerState }) {
  return <Status {...container[value]} />
}

export function DomainStatusView({ value }: { value: DomainStatus }) {
  return <Status {...domain[value]} />
}
