"use client"

import { motion, useReducedMotion } from "motion/react"

/**
 * Re-mounts on every navigation so each page settles in with a short,
 * critically damped rise instead of popping in.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className="route-stage"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.38 }}
    >
      {children}
    </motion.div>
  )
}
