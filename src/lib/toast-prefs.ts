"use client"

import { useSyncExternalStore } from "react"

export type ToastPosition = "bottom-right" | "bottom-center" | "bottom-left" | "top-right" | "top-center"
export type ToastStyle = "light" | "dark" | "brand"

export interface ToastPrefs {
  position: ToastPosition
  style: ToastStyle
}

const KEY = "arcellite-toast-prefs-v1"
const DEFAULTS: ToastPrefs = { position: "bottom-right", style: "light" }
const listeners = new Set<() => void>()
let cached: ToastPrefs | null = null

function read(): ToastPrefs {
  if (cached) return cached
  try {
    const raw = window.localStorage.getItem(KEY)
    cached = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ToastPrefs>) } : DEFAULTS
  } catch {
    cached = DEFAULTS
  }
  return cached
}

export function setToastPrefs(next: Partial<ToastPrefs>) {
  cached = { ...read(), ...next }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cached))
  } catch {
    // Preferences still apply for this visit when storage is unavailable.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Where notification pop-ups appear and how they look. Stored per browser. */
export function useToastPrefs(): ToastPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS)
}
