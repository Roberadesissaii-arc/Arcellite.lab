export interface DotenvEntry {
  key: string
  value: string
  line: number
}

export interface DotenvResult {
  entries: DotenvEntry[]
  skipped: number[]
}

const SECRET_HINT = /(SECRET|TOKEN|KEY|PASSWORD|PASS|PRIVATE|CREDENTIAL|AUTH|DSN|DATABASE_URL)/

/** Parses a `.env` file: KEY=VALUE lines, comments, `export` prefixes, and quoted values. */
export function parseDotenv(source: string): DotenvResult {
  const entries = new Map<string, DotenvEntry>()
  const skipped: number[] = []
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith("#")) return
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line)
    if (!match) {
      skipped.push(index + 1)
      return
    }
    const key = match[1].toUpperCase().replace(/[.-]/g, "_")
    let value = match[2]
    const quote = value[0]
    if (quote === '"' || quote === "'" || quote === "`") {
      const end = value.indexOf(quote, 1)
      value = end === -1 ? value.slice(1) : value.slice(1, end)
      if (quote === '"') value = value.replace(/\\n/g, "\n")
    } else {
      value = value.replace(/\s+#.*$/, "").trim()
    }
    entries.set(key, { key, value, line: index + 1 })
  })
  return { entries: [...entries.values()], skipped }
}

/** True when a variable name looks like it holds a credential. */
export function looksSecret(key: string): boolean {
  return SECRET_HINT.test(key)
}
