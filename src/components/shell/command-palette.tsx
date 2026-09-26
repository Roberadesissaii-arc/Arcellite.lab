"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { searchGlobal } from "@/lib/deploy/filters"
import { useDeployState } from "@/lib/deploy/react"
import { DOCS_ITEM, NAV_GROUPS, NOTIFICATIONS_ITEM, SETTINGS_ITEM } from "@/components/nav"

const COMMANDS = [
  { label: "New project", href: "/projects/new", group: "Actions" },
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, group: "Navigate" }))),
  { label: DOCS_ITEM.label, href: DOCS_ITEM.href, group: "Navigate" },
  { label: SETTINGS_ITEM.label, href: SETTINGS_ITEM.href, group: "Navigate" },
  { label: NOTIFICATIONS_ITEM.label, href: NOTIFICATIONS_ITEM.href, group: "Navigate" },
]

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const state = useDeployState()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const commands = COMMANDS.filter((item) => !q || item.label.toLowerCase().includes(q)).map((item) => ({
      id: item.href + item.label,
      title: item.label,
      subtitle: item.group,
      href: item.href,
    }))
    const hits = state ? searchGlobal(state, query).map((hit) => ({ id: hit.id, title: hit.title, subtitle: `${hit.kind} · ${hit.subtitle}`, href: hit.href })) : []
    return [...commands, ...hits].slice(0, 12)
  }, [query, state])

  function close(next = false) {
    if (!next) {
      setQuery("")
      setIndex(0)
    }
    onOpenChange(next)
  }

  function go(href: string) {
    close(false)
    router.push(href)
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-scrim z-50" />
        <Dialog.Content
          className="workspace-surface material fixed left-1/2 top-[14vh] z-50 w-[min(560px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-sheet)] border border-[var(--border-subtle)] shadow-[var(--shadow-overlay)]"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search projects, deployments, and pages.</Dialog.Description>
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIndex(0)
            }}
            placeholder="Search projects, servers, commands"
            className="w-full border-0 bg-transparent px-4 py-3.5 text-[15px] outline-none"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setIndex((value) => Math.min(results.length - 1, value + 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setIndex((value) => Math.max(0, value - 1))
              } else if (event.key === "Enter" && results[index]) {
                event.preventDefault()
                go(results[index].href)
              }
            }}
          />
          <div className="max-h-80 overflow-auto border-t border-[var(--border-subtle)] p-1.5">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted">No matches.</p>
            ) : (
              results.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left"
                  style={{ background: itemIndex === index ? "var(--press)" : undefined }}
                  onMouseEnter={() => setIndex(itemIndex)}
                  onClick={() => go(item.href)}
                >
                  <span className="truncate text-sm font-medium">{item.title}</span>
                  <span className="shrink-0 text-xs text-faint">{item.subtitle}</span>
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
