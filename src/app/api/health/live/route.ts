/** Liveness: the process is serving requests. Says nothing about dependencies. */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } })
}
