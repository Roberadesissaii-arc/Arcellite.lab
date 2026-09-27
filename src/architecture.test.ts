import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const SRC = path.resolve(__dirname)

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return files(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

const SERVER_ONLY = /from\s+["'](@\/server\/|pg["']|drizzle-orm|@node-rs\/argon2|node:crypto["'])/

describe("module boundaries", () => {
  const all = files(SRC)

  it("no client component imports server code", () => {
    const offenders = all.filter((file) => {
      const text = readFileSync(file, "utf8")
      return /^["']use client["']/m.test(text) && SERVER_ONLY.test(text)
    })
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([])
  })

  it("shared browser libraries and components never import server code", () => {
    const offenders = all
      .filter((file) => /^(lib|components)\//.test(path.relative(SRC, file)) && !file.endsWith(".test.ts"))
      .filter((file) => SERVER_ONLY.test(readFileSync(file, "utf8")))
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([])
  })

  it("every server module is marked server-only", () => {
    const unmarked = all
      .filter((file) => path.relative(SRC, file).startsWith("server/") && !file.endsWith(".test.ts"))
      .filter((file) => !/db\/schema\//.test(file))
      .filter((file) => !readFileSync(file, "utf8").startsWith('import "server-only"'))
    expect(unmarked.map((file) => path.relative(SRC, file))).toEqual([])
  })

  it("nothing under src controls Docker, a shell, or a remote host", () => {
    const offenders = all
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) => /from\s+["'](node:)?child_process["']|dockerode|docker\.sock|ssh2/.test(readFileSync(file, "utf8")))
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([])
  })
})
