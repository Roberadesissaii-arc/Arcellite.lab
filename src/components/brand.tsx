import Link from "next/link"
import { cn } from "@/lib/cn"

/** Cloud glyph copied from the live arcellite.com navigation and favicon.svg. */
export function ArcelliteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("text-brand", className)} aria-hidden>
      <path
        fill="currentColor"
        d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
      />
    </svg>
  )
}

export function BrandLockup({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2 rounded-[8px] px-1.5 py-1" aria-label="Arcellite Deploy, overview">
      <ArcelliteMark className="h-5 w-5 shrink-0" />
      <span className="brand-word flex min-w-0 items-baseline">
        <span className="text-[15px] font-bold tracking-tight text-ink">Arcellite</span>
        <span className="text-[18px] font-black leading-none text-brand">.</span>
        <span className="ml-1.5 text-[13px] font-medium tracking-tight text-muted">Deploy</span>
      </span>
    </Link>
  )
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 .5C5.65.5.5 5.65.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
      />
    </svg>
  )
}
