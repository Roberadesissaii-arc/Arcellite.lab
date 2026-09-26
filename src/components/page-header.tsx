export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="page-introduction">
      <div className="min-w-0">
        <p className="page-kicker">{kicker ?? "Arcellite Deploy"}</p>
        <h1 className="page-title mt-1 font-heading">{title}<span className="text-brand">.</span></h1>
        {description ? <p className="page-copy mt-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
