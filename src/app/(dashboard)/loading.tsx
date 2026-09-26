import { PageSkeleton } from "@/components/ui/bits"

/** Only shown when a page takes a moment; quick navigations never flash a skeleton. */
export default function Loading() {
  return (
    <div className="route-loading">
      <PageSkeleton />
    </div>
  )
}
