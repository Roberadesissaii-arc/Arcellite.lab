import Link from "next/link"
import { Box, FolderGit2, FolderKanban, GitBranch, Globe2, Server, Sparkle, type LucideIcon } from "lucide-react"
import { IconTile, type Tone } from "@/components/ui/kit"
import { formatClock, formatDate, formatRelative } from "@/lib/deploy/format"
import type { ActivityEvent } from "@/lib/deploy/types"

const TYPE_ICON: Record<string, LucideIcon> = {
  Container: Box,
  Deployment: GitBranch,
  Domain: Globe2,
  "Git provider": FolderGit2,
  Project: FolderKanban,
  Server,
}

const RESULT_TONE: Record<ActivityEvent["result"], Tone> = {
  success: "success",
  warning: "warning",
  error: "danger",
  info: "brand",
}

/** Day-grouped vertical timeline shared by Events, Activity, and Notifications. */
export function ActivityTimeline({
  events,
  now,
  showActor = false,
  relative = false,
}: {
  events: ActivityEvent[]
  now: number
  showActor?: boolean
  relative?: boolean
}) {
  const groups: { day: string; items: ActivityEvent[] }[] = []
  for (const event of events) {
    const day = formatDate(event.timestamp)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(event)
    else groups.push({ day, items: [event] })
  }
  return (
    <div className="panel timeline">
      {groups.map((group) => (
        <section key={group.day}>
          <p className="timeline-day">{group.day}</p>
          <ol>
            {group.items.map((event) => (
              <li key={event.id} className="timeline-item">
                <IconTile icon={TYPE_ICON[event.objectType] ?? Sparkle} tone={RESULT_TONE[event.result]} />
                <div className="timeline-body">
                  <p>{event.href ? <Link href={event.href} className="hover:text-[var(--brand-primary)]">{event.action}</Link> : event.action}</p>
                  <p className="timeline-sub">
                    {event.objectType} · <span className="text-[var(--text-secondary)]">{event.objectName}</span>
                    {showActor ? <> · {event.actor}</> : null}
                  </p>
                  {event.detail ? <p className="timeline-sub">{event.detail}</p> : null}
                </div>
                <time className="timeline-time" dateTime={event.timestamp}>{relative ? formatRelative(event.timestamp, now) : formatClock(event.timestamp)}</time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
