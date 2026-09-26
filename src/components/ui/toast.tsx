"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { springFast } from "@/lib/motion"

export interface ToastInput {
  title: string
  description?: string
  tone?: "default" | "danger"
}

interface ToastItem extends ToastInput {
  id: string
}

const ToastContext = createContext<(input: ToastInput) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const reduced = useReducedMotion()
  const push = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID()
    setItems((current) => [...current.slice(-2), { ...input, id }])
    const life = input.tone === "danger" ? 6400 : 3200
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, life)
  }, [])
  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              role={item.tone === "danger" ? "alert" : "status"}
              className="material pointer-events-auto w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--border-subtle)] px-4 py-3 shadow-[var(--shadow-popover)]"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              transition={reduced ? { duration: 0.12 } : springFast}
            >
              <p className={item.tone === "danger" ? "text-sm font-semibold text-[var(--status-danger)]" : "text-sm font-semibold"}>
                {item.title}
              </p>
              {item.description ? <p className="mt-1 text-sm text-muted">{item.description}</p> : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
