"use client"

import { AlertTriangle, CircleHelp, X, type LucideIcon } from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { springFast, springSnappy } from "@/lib/motion"
import { cn } from "@/lib/cn"
import { Button } from "./button"

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  icon: Icon,
  tone = "brand",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  wide?: boolean
  icon?: LucideIcon
  tone?: "brand" | "danger" | "warning" | "success" | "info"
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
            {/* Centred over the workspace, not the viewport, so the sidebar never offsets it. */}
            <div className="dialog-frame">
              <Dialog.Content
                asChild
                forceMount
                onOpenAutoFocus={(event) => {
                  // Keep focus on the dialog (or a field that asked for it) rather than ringing the close button.
                  event.preventDefault()
                  const node = event.currentTarget as HTMLElement | null
                  if (node && !node.contains(document.activeElement)) node.focus()
                }}
              >
                <motion.div
                  className="dialog workspace-surface"
                  data-wide={wide || undefined}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                  transition={reduced ? { duration: 0.12 } : springSnappy}
                >
                  <header className="dialog-head">
                    {Icon ? <span className="dialog-icon" data-tone={tone}><Icon aria-hidden /></span> : null}
                    <div className="min-w-0 flex-1">
                      <Dialog.Title className="dialog-title">{title}</Dialog.Title>
                      {description ? (
                        <Dialog.Description className="dialog-description">{description}</Dialog.Description>
                      ) : (
                        <Dialog.Description className="sr-only">Dialog</Dialog.Description>
                      )}
                    </div>
                    <Dialog.Close className="icon-btn pressable dialog-close" aria-label="Close dialog"><X aria-hidden /></Dialog.Close>
                  </header>
                  <div className="dialog-body">{children}</div>
                </motion.div>
              </Dialog.Content>
            </div>
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
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={body} icon={danger ? AlertTriangle : CircleHelp} tone={danger ? "danger" : "brand"}>
      <div className="dialog-actions">
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
