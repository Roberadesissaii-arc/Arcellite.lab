import "server-only"
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto"
import { masterKeyring, type MasterKeyring } from "@/server/config"

/** An encrypted value as stored: every part base64. */
export interface SealedValue {
  ciphertext: string
  nonce: string
  tag: string
  keyVersion: number
}

export class DecryptionError extends Error {
  constructor() {
    super("The value could not be decrypted with the configured master key.")
    this.name = "DecryptionError"
  }
}

const ALGORITHM = "aes-256-gcm"
const NONCE_BYTES = 12

/**
 * AES-256-GCM with a fresh random 96-bit nonce per value. The associated data binds each
 * ciphertext to the row it belongs to, so a value copied into another row fails to decrypt.
 */
export function createSecretBox(keyring: MasterKeyring) {
  function seal(plaintext: string, associatedData: string): SealedValue {
    const key = keyring.keys.get(keyring.current)
    if (!key) throw new DecryptionError()
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv(ALGORITHM, key, nonce)
    cipher.setAAD(Buffer.from(associatedData, "utf8"))
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    return {
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      keyVersion: keyring.current,
    }
  }

  function open(sealed: SealedValue, associatedData: string): string {
    const key = keyring.keys.get(sealed.keyVersion)
    if (!key) throw new DecryptionError()
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.nonce, "base64"))
      decipher.setAAD(Buffer.from(associatedData, "utf8"))
      decipher.setAuthTag(Buffer.from(sealed.tag, "base64"))
      return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8")
    } catch {
      throw new DecryptionError()
    }
  }

  return { seal, open, currentVersion: keyring.current }
}

export type SecretBox = ReturnType<typeof createSecretBox>

let cached: SecretBox | null = null

/** The process-wide box, built from ARCELLITE_MASTER_KEY on first use (and validated then). */
export function secretBox(): SecretBox {
  cached ??= createSecretBox(masterKeyring())
  return cached
}

let digestKey: Buffer | null = null

/**
 * HMAC-SHA256 under a key derived from ARCELLITE_MASTER_KEY (version 1, so it survives
 * rotation). Used where a fingerprint of request data is stored, such as idempotency
 * request hashes, so a stored digest of a low-entropy secret cannot be brute-forced offline.
 */
export function keyedDigest(value: string): string {
  if (!digestKey) {
    const root = masterKeyring().keys.get(1)
    if (!root) throw new DecryptionError()
    digestKey = Buffer.from(hkdfSync("sha256", root, Buffer.alloc(0), "arcellite:request-digest:v1", 32))
  }
  return createHmac("sha256", digestKey).update(value, "utf8").digest("hex")
}
