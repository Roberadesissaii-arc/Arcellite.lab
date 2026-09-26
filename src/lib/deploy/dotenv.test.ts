import { describe, expect, it } from "vitest"
import { looksSecret, parseDotenv } from "./dotenv"

describe("parseDotenv", () => {
  it("reads keys, quotes, comments, and export prefixes", () => {
    const { entries, skipped } = parseDotenv([
      "# comment",
      "",
      "PORT=3000",
      "export API_TOKEN='abc 123'",
      'GREETING="hello\\nworld" # trailing',
      "NODE_ENV=production # inline comment",
      "not a line",
      "PORT=4000",
    ].join("\n"))
    expect(entries).toEqual([
      { key: "PORT", value: "4000", line: 8 },
      { key: "API_TOKEN", value: "abc 123", line: 4 },
      { key: "GREETING", value: "hello\nworld", line: 5 },
      { key: "NODE_ENV", value: "production", line: 6 },
    ])
    expect(skipped).toEqual([7])
  })

  it("flags credential-like names", () => {
    expect(looksSecret("STRIPE_SECRET_KEY")).toBe(true)
    expect(looksSecret("DATABASE_URL")).toBe(true)
    expect(looksSecret("PORT")).toBe(false)
  })
})
