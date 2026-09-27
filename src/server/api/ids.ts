import "server-only"
import { notFound } from "./failure"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Path IDs are UUIDs; anything else is simply not found (never a database error). */
export function requireId(value: string | undefined, what: string): string {
  if (!value || !UUID.test(value)) throw notFound(what)
  return value.toLowerCase()
}
