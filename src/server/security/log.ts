import "server-only"

/*
 * Structured control-plane logging. Every record passes through `redact`, so a caller
 * cannot leak a password, token, cookie, key, or secret value by passing the wrong field.
 */

const SENSITIVE_KEY = /pass(word)?|token|secret|cookie|authorization|csrf|master.?key|api.?key|private|credential|ciphertext|nonce|^value$|plaintext|session/i
const MAX_STRING = 500

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : redactString(value)
  if (typeof value !== "object") return value
  if (depth > 4) return "[depth]"
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1))
  if (value instanceof Error) return { name: value.name }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1)
  }
  return out
}

/** Masks credentials that appear inline: URLs with userinfo and key=value pairs. */
export function redactString(value: string): string {
  return value
    .replace(/(\/\/[^:/\s]+):[^@/\s]+@/g, "$1:[redacted]@")
    .replace(/((?:password|token|secret|key)=)[^\s&]+/gi, "$1[redacted]")
}

type Level = "debug" | "info" | "warn" | "error"

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (process.env.ARCELLITE_LOG_SILENT === "true") return
  const record = { ts: new Date().toISOString(), level, event, ...(redact(fields) as Record<string, unknown>) }
  const line = JSON.stringify(record)
  if (level === "error" || level === "warn") console.error(line)
  else console.log(line)
}
