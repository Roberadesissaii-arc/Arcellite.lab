export function formatRelative(iso: string, now: number): string {
  const delta = now - Date.parse(iso)
  if (Number.isNaN(delta)) return ""
  const seconds = Math.round(delta / 1000)
  if (Math.abs(seconds) < 10) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? "1 hr ago" : `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 14) return days === 1 ? "1 day ago" : `${days} days ago`
  return formatDate(iso)
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const min = minutes % 60
  return min ? `${hours}h ${min}m` : `${hours}h`
}

export function formatUptime(fromIso: string | null, now: number): string {
  if (!fromIso) return "—"
  let seconds = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000))
  const days = Math.floor(seconds / 86400)
  seconds %= 86400
  const hours = Math.floor(seconds / 3600)
  seconds %= 3600
  const minutes = Math.floor(seconds / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—"
  const abs = Math.abs(bytes)
  if (abs < 1024) return `${Math.round(bytes)} B`
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (abs < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatGb(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return Number.isInteger(value) ? `${value} GB` : `${value.toFixed(1)} GB`
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

export function greeting(name: string, now: number): string {
  const hour = new Date(now).getHours()
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"
  return `Good ${part}, ${name}`
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}
