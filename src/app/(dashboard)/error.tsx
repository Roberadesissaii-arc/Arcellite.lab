"use client"

import { Button } from "@/components/ui/button"

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page">
      <h1 className="page-title">This view could not be shown</h1>
      <p className="page-copy mt-3">{error.message || "The page failed while rendering the current workspace."}</p>
      <Button className="mt-6" variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
