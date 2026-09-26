/** Motion tokens mapped from Apple's damping/response guidance.
 *  Default UI is critically damped. Sheets that follow a gesture get a little bounce.
 */
export const springSnappy = { type: "spring" as const, bounce: 0, duration: 0.32 }
export const springSheet = { type: "spring" as const, bounce: 0.18, duration: 0.32 }
export const springFast = { type: "spring" as const, bounce: 0, duration: 0.18 }
export const fadeFast = { duration: 0.15, ease: "easeOut" as const }

export const pressScale = 0.98
