"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import * as Dialog from "@radix-ui/react-dialog"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { springSheet } from "@/lib/motion"
import { formatRelative } from "@/lib/deploy/format"
import { Activity, ArrowUp, ArrowUpRight, Globe2, History, Info, Layers, MessageSquare, Server, Sparkle, SquarePen, Trash2, TriangleAlert, X, type LucideIcon } from "lucide-react"
import { useDeployState } from "@/lib/deploy/react"
import { answerProjectQuestion, type AssistantReply } from "@/lib/deploy/assistant"
import { formatReply } from "@/lib/deploy/assistant-format"
import { useNow } from "@/lib/use-now"
import { PageSkeleton } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"
import { IconTile } from "@/components/ui/kit"

type Message = { role: "user" | "assistant"; text: string; links?: AssistantReply['links'] }
const KEY = 'arcellite-project-chat-v1'
const ASSISTANT = 'Arc'
const suggestions: { text: string; hint: string; icon: LucideIcon }[] = [
  { text: 'What is running right now?', hint: 'Deployments and containers', icon: Activity },
  { text: 'What needs attention?', hint: 'Failures and warnings', icon: TriangleAlert },
  { text: 'Check server resources', hint: 'CPU, memory, and storage', icon: Server },
  { text: 'Check my domains', hint: 'DNS and certificates', icon: Globe2 },
]

const HISTORY_KEY = 'arcellite-project-chat-history-v1'
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number }

function sanitize(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(m => m && ['user','assistant'].includes(m.role) && typeof m.text === 'string').slice(-60).map(m => ({role:m.role,text:m.text,links:Array.isArray(m.links) ? m.links.filter((l: {label?:unknown;href?:unknown}) => typeof l.label === 'string' && typeof l.href === 'string' && /^\/(projects|deployments|containers|domains|servers|metrics|logs)(\/|$)/.test(l.href)) : undefined}))
}

function readHistory(): Conversation[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(item => item && typeof item.id === 'string' && typeof item.updatedAt === 'number').map(item => ({ id: item.id, title: String(item.title ?? 'Conversation'), updatedAt: item.updatedAt, messages: sanitize(item.messages) })).filter(item => item.messages.length).slice(0, 30)
  } catch { return [] }
}

const subscribe = () => () => {}
export function ProjectChat() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false)
  return hydrated ? <ChatSession /> : <PageSkeleton variant="chat" />
}
function ChatSession() {
  const state = useDeployState()
  const now = useNow(1000)
  const [projectId,setProjectId] = useState('all')
  const [question,setQuestion] = useState('')
  const [messages,setMessages] = useState<Message[]>(() => {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? '[]')) } catch { /* Invalid stored conversations start fresh. */ }
    return []
  })
  const [history,setHistory] = useState<Conversation[]>(readHistory)
  const [activeId,setActiveId] = useState<string | null>(null)
  const [historyOpen,setHistoryOpen] = useState(false)
  function saveHistory(next: Conversation[]) {
    setHistory(next)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* History is best-effort without storage. */ }
  }
  /** Files the open conversation into history and returns the updated list. */
  function archive(list: Conversation[] = history): Conversation[] {
    if (!messages.length) return list
    const id = activeId ?? crypto.randomUUID()
    const title = messages.find(m => m.role === 'user')?.text.slice(0, 80) ?? 'Conversation'
    return [{ id, title, messages, updatedAt: Date.now() }, ...list.filter(item => item.id !== id)].slice(0, 30)
  }
  function newChat() {
    saveHistory(archive())
    setMessages([])
    setActiveId(null)
  }
  function openConversation(item: Conversation) {
    const next = archive().filter(entry => entry.id !== item.id)
    saveHistory([item, ...next])
    setMessages(item.messages)
    setActiveId(item.id)
    setHistoryOpen(false)
  }
  useEffect(() => {
    const viewport = window.visualViewport
    const resize = () => document.documentElement.style.setProperty('--chat-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
    resize()
    viewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      window.removeEventListener('resize', resize)
      document.documentElement.style.removeProperty('--chat-viewport-height')
    }
  }, [])
  const log = useRef<HTMLDivElement>(null)
  useEffect(()=>{try {localStorage.setItem(KEY,JSON.stringify(messages))}catch{/* Chat remains usable without storage. */} log.current?.scrollTo({top:log.current.scrollHeight})},[messages])
  if(!state) return <PageSkeleton variant="chat" />
  const initials = state.settings.displayName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('') || 'U'
  function send(text: string) {
    if(!text.trim() || !state) return
    const reply=answerProjectQuestion(state,text,projectId,now)
    setMessages(current=>[...current,{role:'user' as const,text:text.trim()},{role:'assistant' as const,...reply}].slice(-60))
    setQuestion('')
  }
  return <div className="page project-chat-page">
    <header className="chat-topbar">
      <span className="chat-avatar" aria-hidden><Sparkle /></span>
      <div className="min-w-0">
        <h1>Ask {ASSISTANT}</h1>
        <p><span className="chat-live-dot" />Workspace assistant · Local, Phase 1</p>
      </div>
      <div className="chat-header-actions">
        <button type="button" className="chat-action" onClick={()=>setHistoryOpen(true)}><History aria-hidden /><span>History</span>{history.length ? <span className="chat-history-count">{history.length}</span> : null}</button>
        <span className="chat-action-sep" aria-hidden />
        <button type="button" className="chat-action" disabled={!messages.length} onClick={newChat} title="Saves this conversation to History and starts a new one"><SquarePen aria-hidden /><span>New chat</span></button>
      </div>
    </header>

    <div className="chat-stage">
    <div ref={log} className="chat-conversation" role="log" aria-label={`Conversation with ${ASSISTANT}`} aria-live="polite">
      <div className="chat-column">
        {!messages.length ? <div className="chat-welcome">
          <span className="chat-welcome-mark"><Sparkle /></span>
          <h2>Know what’s happening.<span>Keep your projects moving.</span></h2>
          <p>Ask {ASSISTANT} about deployments, containers, and the health of your workspace. Answers use your current local project data.</p>
          <div className="chat-suggestions">{suggestions.map(({ text, hint, icon: Icon })=><button key={text} type="button" className="pressable" onClick={()=>send(text)}>
            <span className="chat-suggestion-icon"><Icon aria-hidden /></span>
            <span className="min-w-0 flex-1"><strong>{text}</strong><small>{hint}</small></span>
            <ArrowUpRight aria-hidden className="chat-suggestion-arrow" />
          </button>)}</div>
        </div> : messages.map((m,i)=><article key={i} className={`chat-message chat-message-${m.role}`}>
          {m.role==='assistant' ? <span className="chat-avatar chat-avatar-sm" aria-hidden><Sparkle /></span> : null}
          <div className="chat-bubble">
            <p className="chat-message-author">{m.role==='assistant' ? ASSISTANT : 'You'}</p>
            {m.role==='assistant' ? <ReplyBody text={m.text} /> : <p className="whitespace-pre-line">{m.text}</p>}
            {m.links && m.links.length ? <div className="chat-result-links">{m.links.map(l=><Link key={l.href} href={l.href}>{l.label}<ArrowUpRight size={13}/></Link>)}</div> : null}
          </div>
          {m.role==='user' ? <span className="chat-user-avatar" aria-hidden>{initials}</span> : null}
        </article>)}
      </div>
    </div>

    <div className="chat-dock">
      <form className="chat-composer" onSubmit={e=>{e.preventDefault();send(question)}}>
        <label className="sr-only" htmlFor="project-question">Ask {ASSISTANT} about your projects</label>
        <textarea id="project-question" rows={1} value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(question) } }} placeholder={`Ask ${ASSISTANT} about your projects…`} autoComplete="off"/>
        <div className="chat-composer-bar">
          <span className="chat-context">
            <Layers aria-hidden />
            <SelectInput aria-label="Context" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="all">All projects</option>{state.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput>
          </span>
          <button type="submit" className="btn btn-primary chat-send pressable" aria-label="Send question" disabled={!question.trim()}><ArrowUp aria-hidden/></button>
        </div>
      </form>
      <p className="chat-disclaimer">{ASSISTANT} reads local workspace data only · No external AI connection · Infrastructure is simulated</p>
    </div>
    </div>
    <HistorySheet
      open={historyOpen}
      onOpenChange={setHistoryOpen}
      items={history}
      activeId={activeId}
      now={now}
      onOpen={openConversation}
      onDelete={(id)=>saveHistory(history.filter(item=>item.id!==id))}
      onClearAll={()=>saveHistory([])}
    />
  </div>
}

function HistorySheet({ open, onOpenChange, items, activeId, now, onOpen, onDelete, onClearAll }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: Conversation[]
  activeId: string | null
  now: number
  onOpen: (item: Conversation) => void
  onDelete: (id: string) => void
  onClearAll: () => void
}) {
  const reduced = useReducedMotion()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="overlay-scrim z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.aside
                className="workspace-surface chat-history-sheet"
                initial={reduced ? { opacity: 0 } : { x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { x: 40, opacity: 0 }}
                transition={reduced ? { duration: 0.12 } : springSheet}
              >
                <header className="chat-history-head">
                  <IconTile icon={History} tone="brand" />
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-[15px] font-semibold">History</Dialog.Title>
                    <Dialog.Description className="text-xs text-faint">{items.length ? `${items.length} saved conversation${items.length === 1 ? '' : 's'}` : 'Cleared chats are saved here.'}</Dialog.Description>
                  </div>
                  <Dialog.Close className="icon-btn" aria-label="Close history"><X aria-hidden /></Dialog.Close>
                </header>
                <div className="chat-history-list">
                  {items.length === 0 ? (
                    <div className="chat-history-empty"><MessageSquare aria-hidden /><p>No saved conversations yet.</p><small>Press Clear to save the current chat and start fresh.</small></div>
                  ) : items.map((item) => (
                    <div key={item.id} className="chat-history-item" data-active={item.id === activeId}>
                      <button type="button" className="chat-history-open" onClick={() => onOpen(item)}>
                        <strong>{item.title}</strong>
                        <small>{formatRelative(new Date(item.updatedAt).toISOString(), now)} · {item.messages.filter(m => m.role === 'user').length} question{item.messages.filter(m => m.role === 'user').length === 1 ? '' : 's'}</small>
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Delete ${item.title}`} onClick={() => onDelete(item.id)}><Trash2 aria-hidden /></button>
                    </div>
                  ))}
                </div>
                {items.length ? <footer className="chat-history-foot"><button type="button" className="btn btn-ghost btn-sm" onClick={onClearAll}><Trash2 aria-hidden />Delete all</button></footer> : null}
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  )
}

function ReplyBody({ text }: { text: string }) {
  return <div className="chat-reply">{formatReply(text).map((block, index) => {
    if (block.kind === 'items') return <ul key={index} className="chat-reply-items">{block.items.map((item, itemIndex) => <li key={itemIndex}>
      <div className="chat-reply-row"><strong>{item.title}</strong>{item.status ? <span className="chat-reply-status" data-tone={item.tone}>{statusLabel(item.status)}</span> : null}</div>
      {item.detail ? <p>{item.detail}</p> : null}
    </li>)}</ul>
    if (block.kind === 'note') return <p key={index} className="chat-reply-note"><Info aria-hidden />{block.text}</p>
    return <p key={index} className="chat-reply-text">{block.text}</p>
  })}</div>
}

function statusLabel(status: string): string {
  return status.replace(/^dns\b/, "DNS").replace(/^./, (first) => first.toUpperCase())
}
