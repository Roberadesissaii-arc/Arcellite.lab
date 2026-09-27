import "server-only"

/*
 * Control-plane configuration, read from the server environment at request time.
 * Nothing here is ever sent to the browser except the provider mode.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

export type ProviderMode = "mock" | "server"

/** Which DeployProvider the app runs. Defaults to the in-browser mock. */
export function providerMode(): ProviderMode {
  const value = (process.env.ARCELLITE_PROVIDER ?? "mock").trim()
  if (value === "mock" || value === "server") return value
  throw new ConfigError(`ARCELLITE_PROVIDER must be "mock" or "server" (got "${value}").`)
}

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  if (!value) throw new ConfigError("DATABASE_URL is not set. See .env.example.")
  if (!/^postgres(ql)?:\/\//.test(value)) throw new ConfigError("DATABASE_URL must be a postgres:// connection string.")
  return value
}

export interface MasterKeyring {
  /** Version used for new encryptions. */
  current: number
  keys: ReadonlyMap<number, Buffer>
}

function decodeKey(name: string, raw: string): Buffer {
  const value = raw.trim()
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    throw new ConfigError(`${name} must be base64. Generate one with: openssl rand -base64 32`)
  }
  const key = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  if (key.length !== 32) {
    throw new ConfigError(`${name} must decode to exactly 32 bytes (got ${key.length}). Generate one with: openssl rand -base64 32`)
  }
  return key
}

/**
 * The encryption keyring. ARCELLITE_MASTER_KEY is version 1. A rotation adds
 * ARCELLITE_MASTER_KEY_V2 (and sets ARCELLITE_MASTER_KEY_VERSION=2) while keeping the old
 * key so existing ciphertext still decrypts. Keys are never derived from passwords.
 */
export function masterKeyring(): MasterKeyring {
  const primary = process.env.ARCELLITE_MASTER_KEY
  if (!primary) throw new ConfigError("ARCELLITE_MASTER_KEY is not set. Generate one with: openssl rand -base64 32")
  const keys = new Map<number, Buffer>([[1, decodeKey("ARCELLITE_MASTER_KEY", primary)]])
  for (const [name, raw] of Object.entries(process.env)) {
    const match = /^ARCELLITE_MASTER_KEY_V(\d+)$/.exec(name)
    if (match && raw) keys.set(Number(match[1]), decodeKey(name, raw))
  }
  const current = Number(process.env.ARCELLITE_MASTER_KEY_VERSION ?? 1)
  if (!Number.isInteger(current) || !keys.has(current)) {
    throw new ConfigError(`ARCELLITE_MASTER_KEY_VERSION=${current} has no matching key.`)
  }
  return { current, keys }
}

/**
 * Origins allowed to send state-changing requests. ARCELLITE_APP_URL is the public URL of
 * this control plane; ARCELLITE_TRUSTED_ORIGINS adds more (comma-separated). With neither
 * set, only loopback origins are trusted, which covers local development.
 */
export function trustedOrigins(): string[] {
  const origins = new Set<string>()
  for (const raw of [process.env.ARCELLITE_APP_URL, ...(process.env.ARCELLITE_TRUSTED_ORIGINS ?? "").split(",")]) {
    const value = raw?.trim()
    if (!value) continue
    try {
      origins.add(new URL(value).origin)
    } catch {
      throw new ConfigError(`"${value}" in ARCELLITE_APP_URL / ARCELLITE_TRUSTED_ORIGINS is not a URL.`)
    }
  }
  return [...origins]
}

/**
 * Session cookies carry `Secure` in production. ARCELLITE_INSECURE_COOKIES=true turns it off
 * for plain-HTTP LAN installs; browsers still send Secure cookies to http://localhost.
 */
export function secureCookies(): boolean {
  if (process.env.ARCELLITE_INSECURE_COOKIES === "true") return false
  return process.env.NODE_ENV === "production"
}
