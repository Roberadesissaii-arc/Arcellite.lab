import { describe, expect, it } from "vitest"
import { formatReply } from "./assistant-format"

describe("formatReply", () => {
  it("turns project status lines into items and keeps the closing sentence as a note", () => {
    const blocks = formatReply("Arciin: ready. 3 of 3 containers running.\nAPI Sandbox: failed. Build broke.\nThese are the current local mock states.")
    expect(blocks).toEqual([
      {
        kind: "items",
        items: [
          { title: "Arciin", status: "ready", tone: "success", detail: "3 of 3 containers running." },
          { title: "API Sandbox", status: "failed", tone: "danger", detail: "Build broke." },
        ],
      },
      { kind: "note", text: "These are the current local mock states." },
    ])
  })

  it("reads server lines", () => {
    const [block] = formatReply("home-server is online. CPU 17%; memory 4.8 / 16 GB.")
    expect(block).toEqual({ kind: "items", items: [{ title: "home-server", status: "online", tone: "success", detail: "CPU 17%; memory 4.8 / 16 GB." }] })
  })

  it("keeps plain answers as paragraphs", () => {
    expect(formatReply("I can check project status.")).toEqual([{ kind: "paragraph", text: "I can check project status." }])
  })
})
