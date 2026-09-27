import { describe, expect, it } from "vitest"
import { contentSecurityPolicy } from "./proxy"

describe("content security policy", () => {
  it("allows scripts only by nonce in production, and never frames", () => {
    const csp = contentSecurityPolicy("abc123", { dev: false, https: true })
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(csp).not.toContain("unsafe-eval")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("upgrade-insecure-requests")
  })

  it("adds eval only for development and skips the https upgrade on plain-HTTP installs", () => {
    const csp = contentSecurityPolicy("n", { dev: true, https: false })
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).not.toContain("upgrade-insecure-requests")
  })
})
