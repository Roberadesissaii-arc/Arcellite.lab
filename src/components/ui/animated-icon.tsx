"use client"

import { useReducedMotion } from "motion/react"
import { useRef } from "react"

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export type AnimatedIcon = React.ForwardRefExoticComponent<
  { size?: number; className?: string; animateOnHover?: boolean } & React.RefAttributes<AnimatedIconHandle>
>

/** Plays a lucide-animated icon while its host element is hovered or focused. */
export function useIconAnimation() {
  const ref = useRef<AnimatedIconHandle>(null)
  const reduced = useReducedMotion()
  const start = () => { if (!reduced) ref.current?.startAnimation() }
  const stop = () => ref.current?.stopAnimation()
  return { ref, hostProps: { onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop } }
}
