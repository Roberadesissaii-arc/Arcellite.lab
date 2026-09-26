export type ReplyTone = "success" | "warning" | "danger" | "info" | "neutral"

export interface ReplyItem {
  title: string
  status: string | null
  tone: ReplyTone
  detail: string
}

export type ReplyBlock =
  | { kind: "items"; items: ReplyItem[] }
  | { kind: "paragraph"; text: string }
  | { kind: "note"; text: string }

const STATUS_TONE: Record<string, ReplyTone> = {
  ready: "success",
  online: "success",
  active: "success",
  running: "success",
  failed: "danger",
  offline: "danger",
  invalid: "danger",
  degraded: "warning",
  stopped: "warning",
  canceled: "warning",
  "dns required": "warning",
  pending: "warning",
  building: "info",
  deploying: "info",
  preparing: "info",
  queued: "info",
  verifying: "info",
}

function splitStatus(body: string): { status: string | null; detail: string } {
  const match = /^([a-z][a-z ]{1,20}?)\.\s*(.*)$/i.exec(body)
  if (match && STATUS_TONE[match[1].toLowerCase()]) return { status: match[1].toLowerCase(), detail: match[2] }
  return { status: null, detail: body }
}

function parseLine(line: string): ReplyItem | null {
  const named = /^([^:]{1,48}):\s+(.+)$/.exec(line)
  if (named) {
    const { status, detail } = splitStatus(named[2])
    return { title: named[1], status, tone: status ? STATUS_TONE[status] : "neutral", detail }
  }
  const server = /^(\S+) is (online|offline|degraded)\.\s*(.*)$/i.exec(line)
  if (server) {
    const status = server[2].toLowerCase()
    return { title: server[1], status, tone: STATUS_TONE[status], detail: server[3] }
  }
  const needs = /^(\S+) needs (.+)$/.exec(line)
  if (needs) return { title: needs[1], status: "pending", tone: "warning", detail: `Needs ${needs[2]}` }
  return null
}

/** Turns the assistant's line-oriented text into items, paragraphs, and a trailing note. */
export function formatReply(text: string): ReplyBlock[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean)
  const blocks: ReplyBlock[] = []
  let hasItems = false
  lines.forEach((line, index) => {
    const item = parseLine(line)
    if (item) {
      hasItems = true
      const last = blocks[blocks.length - 1]
      if (last?.kind === "items") last.items.push(item)
      else blocks.push({ kind: "items", items: [item] })
      return
    }
    const trailing = index === lines.length - 1 && hasItems
    blocks.push(trailing ? { kind: "note", text: line } : { kind: "paragraph", text: line })
  })
  return blocks
}
