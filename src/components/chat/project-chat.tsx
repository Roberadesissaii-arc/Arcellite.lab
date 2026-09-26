"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Activity, ArrowUp, ArrowUpRight, Globe2, Layers, Server, Sparkle, Trash2, TriangleAlert, type LucideIcon } from "lucide-react"
import { useDeployState } from "@/lib/deploy/react"
import { answerProjectQuestion, type AssistantReply } from "@/lib/deploy/assistant"
import { useNow } from "@/lib/use-now"
import { PageSkeleton } from "@/components/ui/bits"
import { SelectInput } from "@/components/ui/fields"

type Message = { role: "user" | "assistant"; text: string; links?: AssistantReply['links'] }
const KEY = 'arcellite-project-chat-v1'
const ASSISTANT = 'Arc'
const suggestions: { text: string; hint: string; icon: LucideIcon }[] = [
  { text: 'What is running right now?', hint: 'Deployments and containers', icon: Activity },
  { text: 'What needs attention?', hint: 'Failures and warnings', icon: TriangleAlert },
  { text: 'Check server resources', hint: 'CPU, memory, and storage', icon: Server },
  { text: 'Check my domains', hint: 'DNS and certificates', icon: Globe2 },
]

const subscribe = () => () => {}
export function ProjectChat() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false)
  return hydrated ? <ChatSession /> : <PageSkeleton />
}
function ChatSession() {
  const state = useDeployState()
  const now = useNow(1000)
  const [projectId,setProjectId] = useState('all')
  const [question,setQuestion] = useState('')
  const [messages,setMessages] = useState<Message[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]')
      if (Array.isArray(saved)) return saved.filter(m => m && ['user','assistant'].includes(m.role) && typeof m.text === 'string').slice(-60).map(m => ({role:m.role,text:m.text,links:Array.isArray(m.links) ? m.links.filter((l: {label?:unknown;href?:unknown}) => typeof l.label === 'string' && typeof l.href === 'string' && /^\/(projects|deployments|containers|domains|servers|metrics|logs)(\/|$)/.test(l.href)) : undefined}))
    } catch { /* Invalid stored conversations start fresh. */ }
    return []
  })
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
  if(!state) return <PageSkeleton />
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
      <button type="button" className="btn btn-ghost btn-sm chat-clear" disabled={!messages.length} onClick={()=>setMessages([])}><Trash2 aria-hidden /><span>Clear</span></button>
    </header>

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
            <p className="whitespace-pre-line">{m.text}</p>
            {m.links && m.links.length ? <div className="chat-result-links">{m.links.map(l=><Link key={l.href} href={l.href}>{l.label}<ArrowUpRight size={13}/></Link>)}</div> : null}
          </div>
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
}
