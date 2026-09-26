import Link from "next/link"
import { BrandLockup } from "@/components/brand"

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md">
        <BrandLockup />
        <h1 className="page-title mt-8">This page is not in Arcellite Deploy</h1>
        <p className="page-copy mt-3">The address does not match a project, server, or deployment in this workspace.</p>
        <Link href="/" className="btn btn-primary mt-6">
          Back to overview
        </Link>
      </div>
    </main>
  )
}
