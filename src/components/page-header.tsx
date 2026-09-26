import type { LucideIcon } from "lucide-react"

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  icon: Icon,
}: {
  kicker?: string
  title: string
  description?: string
  actions?: React.ReactNode
  icon?: LucideIcon
}) {
  return (
    <header className="page-introduction">
      <div className="page-introduction-main">
        {Icon ? <span className="page-introduction-icon"><Icon aria-hidden /></span> : null}
        <div className="min-w-0">
          <p className="page-kicker">{kicker ?? "Arcellite Deploy"}</p>
          <h1 className="page-title mt-1 font-heading">{title}<span className="text-brand">.</span></h1>
          {description ? <p className="page-copy mt-2">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="page-introduction-actions">{actions}</div> : null}
    </header>
  )
}
