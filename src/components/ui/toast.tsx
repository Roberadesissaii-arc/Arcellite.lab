"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CircleAlert, CircleCheck, Info, X } from "lucide-react"
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { useToastPrefs } from "@/lib/toast-prefs"

export interface ToastInput {
  title: string
  description?: string
  tone?: "default" | "success" | "info" | "danger"
}

interface ToastItem extends ToastInput {
  id: string
}

const ToastContext = createContext<(input: ToastInput) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = { default: CircleCheck, success: CircleCheck, info: Info, danger: CircleAlert }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())
  const reduced = useReducedMotion()
  const prefs = useToastPrefs()

  const dismiss = useCallback((id: string) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const push = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID()
    setItems((current) => {
      // Repeating the same message refreshes it instead of stacking copies.
      const rest = current.filter((item) => !(item.title === input.title && item.description === input.description))
      return [...rest.slice(-2), { ...input, id }]
    })
    const life = input.tone === "danger" ? 6400 : 3600
    timers.current.set(id, window.setTimeout(() => dismiss(id), life))
  }, [dismiss])

  const value = useMemo(() => push, [push])
  const top = prefs.position.startsWith("top")
  const side = prefs.position.endsWith("right") ? 1 : prefs.position.endsWith("left") ? -1 : 0
  const from = reduced ? { opacity: 0 } : side ? { opacity: 0, x: side * 28, scale: 0.98 } : { opacity: 0, y: top ? -14 : 14, scale: 0.98 }
  const ordered = top ? [...items].reverse() : items

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" data-position={prefs.position} aria-live="polite">
        <AnimatePresence initial={false}>
          {ordered.map((item) => {
            const Icon = ICONS[item.tone ?? "default"]
            return (
              <motion.div
                key={item.id}
                layout={!reduced}
                role={item.tone === "danger" ? "alert" : "status"}
                className="toast"
                data-style={prefs.style}
                data-tone={item.tone ?? "default"}
                initial={from}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={from}
                transition={reduced ? { duration: 0.12 } : { type: "spring", bounce: 0, duration: 0.34 }}
              >
                <span className="toast-icon"><Icon aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="toast-title">{item.title}</p>
                  {item.description ? <p className="toast-description">{item.description}</p> : null}
                </div>
                <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(item.id)}><X aria-hidden /></button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
