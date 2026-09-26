"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowUp, ArrowUpRight, Sparkle, Trash2 } from "lucide-react"
import { useDeployState } from "@/lib/deploy/react"
import { answerProjectQuestion, type AssistantReply } from "@/lib/deploy/assistant"
import { useNow } from "@/lib/use-now"
import { PageSkeleton } from "@/components/ui/bits"
import { PageHeader } from "@/components/page-header"

type Message = { role: "user" | "assistant"; text: string; links?: AssistantReply['links'] }
const KEY = 'arcellite-project-chat-v1'
const suggestions = ['What is running right now?', 'What needs attention?', 'Check server resources', 'Check my domains']

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
    <PageHeader
      kicker="Workspace assistant"
      title="Project chat"
      actions={<span className="local-assistant-badge"><span />Local · Phase 1</span>}
    />
    <div className="chat-toolbar"><label htmlFor="chat-project">Context</label><select id="chat-project" className="select" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="all">All projects</option>{state.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" className="btn btn-ghost" disabled={!messages.length} onClick={()=>setMessages([])}><Trash2 size={14}/>Clear chat</button></div>
    <div ref={log} className="chat-conversation" role="log" aria-label="Project conversation" aria-live="polite">
      {!messages.length ? <div className="chat-welcome"><div className="chat-welcome-copy"><span className="chat-welcome-mark"><Sparkle /></span><h2>Know what’s happening.<br/><span>Keep your projects moving.</span></h2><p>Ask about deployments, containers, and the health of your workspace. Answers use your current local project data.</p></div><div className="chat-suggestions">{suggestions.map(s=><button key={s} type="button" onClick={()=>send(s)}>{s}<ArrowUpRight size={14}/></button>)}</div></div> : messages.map((m,i)=><article key={i} className={`chat-message chat-message-${m.role}`}><p className="chat-message-author">{m.role==='assistant' ? <><Sparkle size={14}/>Project assistant</> : 'You'}</p><p className="whitespace-pre-line">{m.text}</p>{m.links && <div className="chat-result-links">{m.links.map(l=><Link key={l.href} href={l.href}>{l.label}<ArrowUpRight size={13}/></Link>)}</div>}</article>)}
    </div>
    <form className="chat-composer" onSubmit={e=>{e.preventDefault();send(question)}}><label className="sr-only" htmlFor="project-question">Ask about your projects</label><input id="project-question" value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about your projects…" autoComplete="off"/><button type="submit" className="btn btn-primary" aria-label="Send question" disabled={!question.trim()}><ArrowUp size={18}/></button></form>
    <p className="chat-disclaimer">Local status assistant · No external AI connection · Infrastructure is simulated</p>
  </div>
}
