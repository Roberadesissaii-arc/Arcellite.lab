"use client"

import { X } from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { springFast, springSheet } from "@/lib/motion"
import { cn } from "@/lib/cn"
import { Button } from "./button"

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  wide?: boolean
}) {
  const reduced = useReducedMotion()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="overlay-scrim z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduced ? { duration: 0.12 } : springFast}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className="workspace-surface material fixed left-1/2 top-[10vh] z-50 max-h-[80vh] overflow-auto rounded-[var(--radius-sheet)] border border-[var(--border-subtle)] p-6 shadow-[var(--shadow-overlay)]"
                style={{ width: wide ? "min(720px, calc(100% - 32px))" : "min(480px, calc(100% - 32px))" }}
                initial={reduced ? { opacity: 0, x: "-50%" } : { opacity: 0, x: "-50%", y: 12, scale: 0.98 }}
                animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0, x: "-50%" } : { opacity: 0, x: "-50%", y: 8, scale: 0.98 }}
                transition={reduced ? { duration: 0.12 } : springSheet}
              >
                <Dialog.Close className="icon-btn pressable absolute right-3 top-3" aria-label="Close dialog"><X aria-hidden /></Dialog.Close>
                <Dialog.Title className="font-display pr-6 text-[1.35rem] leading-tight">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-2 text-sm text-muted">{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">Dialog</Dialog.Description>
                )}
                <div className="mt-5">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  pending = false,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  pending?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={body}>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function Menu({
  trigger,
  children,
  align = "end",
  side = "bottom",
  contentClassName,
}: {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: "start" | "end"
  side?: "top" | "bottom" | "left" | "right"
  contentClassName?: string
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={cn("workspace-surface menu-content", contentClassName)} align={align} side={side} sideOffset={8}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({
  children,
  danger = false,
  onSelect,
}: {
  children: React.ReactNode
  danger?: boolean
  onSelect?: () => void
}) {
  return (
    <DropdownMenu.Item className="menu-item" data-danger={danger || undefined} onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="menu-sep" />
}
