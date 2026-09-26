type ClassValue =
  | string
  | false
  | null
  | undefined
  | ClassValue[]
  | Record<string, unknown>
  // Base UI may type className as (state) => string; callers pass strings at runtime.
  | ((...args: never[]) => unknown)

/** Join class names. Ignores falsy values and Base UI state-fn classNames. */
export function cn(...parts: ClassValue[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    if (typeof part === "string") {
      out.push(part)
      continue
    }
    if (typeof part === "function") continue
    if (Array.isArray(part)) {
      const nested = cn(...part)
      if (nested) out.push(nested)
      continue
    }
    if (typeof part === "object") {
      for (const [key, value] of Object.entries(part)) {
        if (value) out.push(key)
      }
    }
  }
  return out.join(" ")
}
