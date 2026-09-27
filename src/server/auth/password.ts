import "server-only"
import { hash, verify } from "@node-rs/argon2"

/*
 * Argon2id (the library default) at OWASP's baseline cost: 19 MiB, 2 iterations, 1 lane.
 * Raising these later is safe: verify() reads the parameters from each stored hash.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | null = null

/**
 * Burns the same verification cost for an unknown account, so response time does not
 * reveal whether an identity exists.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("arcellite-timing-equalizer-not-a-real-password")
  await verifyPassword(await dummyHash, password)
}
