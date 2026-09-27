import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { ConfigError, masterKeyring } from "@/server/config"
import { createSecretBox } from "./secret-box"

const key = () => randomBytes(32)
const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
})

describe("secret box", () => {
  it("round-trips with a fresh nonce every time", () => {
    const box = createSecretBox({ current: 1, keys: new Map([[1, key()]]) })
    const a = box.seal("hunter2", "aad")
    const b = box.seal("hunter2", "aad")
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(box.open(a, "aad")).toBe("hunter2")
  })

  it("rejects the wrong key, the wrong associated data, and tampering", () => {
    const box = createSecretBox({ current: 1, keys: new Map([[1, key()]]) })
    const sealed = box.seal("value", "row-1")
    expect(() => createSecretBox({ current: 1, keys: new Map([[1, key()]]) }).open(sealed, "row-1")).toThrow()
    expect(() => box.open(sealed, "row-2")).toThrow()
    const flipped = Buffer.from(sealed.ciphertext, "base64")
    flipped[0] ^= 1
    expect(() => box.open({ ...sealed, ciphertext: flipped.toString("base64") }, "row-1")).toThrow()
  })

  it("decrypts old versions after a key rotation and seals with the current one", () => {
    const v1 = key()
    const old = createSecretBox({ current: 1, keys: new Map([[1, v1]]) }).seal("legacy", "aad")
    const rotated = createSecretBox({ current: 2, keys: new Map([[1, v1], [2, key()]]) })
    expect(rotated.open(old, "aad")).toBe("legacy")
    expect(rotated.seal("new", "aad").keyVersion).toBe(2)
  })
})

describe("master key validation", () => {
  it("requires a key", () => {
    delete process.env.ARCELLITE_MASTER_KEY
    expect(() => masterKeyring()).toThrow(ConfigError)
  })

  it("requires base64 that decodes to exactly 32 bytes and never derives one from a passphrase", () => {
    for (const bad of ["correct horse battery staple", randomBytes(16).toString("base64"), randomBytes(48).toString("base64"), "!!!!"]) {
      process.env.ARCELLITE_MASTER_KEY = bad
      expect(() => masterKeyring(), bad).toThrow(/32 bytes|base64/)
    }
  })

  it("loads rotation keys and validates the selected version", () => {
    process.env.ARCELLITE_MASTER_KEY = randomBytes(32).toString("base64")
    process.env.ARCELLITE_MASTER_KEY_V2 = randomBytes(32).toString("base64")
    process.env.ARCELLITE_MASTER_KEY_VERSION = "2"
    expect(masterKeyring().current).toBe(2)
    process.env.ARCELLITE_MASTER_KEY_VERSION = "3"
    expect(() => masterKeyring()).toThrow(ConfigError)
  })
})
