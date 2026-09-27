import "server-only"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** URL-safe random token. 32 bytes = 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

/** SHA-256 hex digest. Tokens are stored only as their digest. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Constant-time string comparison (length is not secret here: both sides are digests or tokens). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")
  return left.length === right.length && timingSafeEqual(left, right)
}
