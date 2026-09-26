"use client"

import { useReducedMotion } from "motion/react"
import { useRef } from "react"

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export type AnimatedIcon = React.ForwardRefExoticComponent<
  { size?: number; className?: string } & React.RefAttributes<AnimatedIconHandle>
>

/**
 * Plays a lucide-animated icon while its surrounding card is hovered or
 * focused. Spread `bind` on the card and pass `ref` to the icon.
 */
export function useIconAnimation() {
  const ref = useRef<AnimatedIconHandle>(null)
  const reduced = useReducedMotion()
  const start = () => ref.current?.startAnimation()
  const stop = () => ref.current?.stopAnimation()
  const bind = reduced ? {} : { onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop }
  return { ref, bind }
}
