"use client"

import * as Dialog from "@radix-ui/react-dialog"
import Link from "next/link"
import { Menu, Plus, Search, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { springSheet } from "@/lib/motion"
import { usePathname } from "next/navigation"
import { CommandPalette } from "./command-palette"
import { Onboarding } from "./onboarding"
import { Sidebar, SidebarNav } from "./sidebar"

export function Shell({ children }: { children: React.ReactNode }) {
  const [palette, setPalette] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const reduced = useReducedMotion()
  const pathname = usePathname()
  const crumb = crumbLabel(pathname)
  const macShortcut = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPalette((open) => !open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])


  return (
    <div className="app-frame">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[80] focus:rounded-[8px] focus:bg-raised focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar />
      <div className={pathname === "/chat" ? "app-main app-main-chat" : "app-main"}>
        <header className={pathname === "/chat" ? "workspace-header workspace-header-chat" : "workspace-header"}>
          <button type="button" className="icon-btn pressable md:hidden" aria-label="Open navigation" onClick={() => setDrawer(true)}>
            <Menu aria-hidden />
          </button>
          <div className="header-chip breadcrumb-chip">
            <Link href="/" className="font-medium">Arcellite</Link>
            <span className="text-[var(--text-tertiary)]">/</span>
            <span className="truncate text-[var(--text-secondary)]">{crumb}</span>
          </div>
          <button type="button" aria-label="Search projects, deployments, servers" className="header-chip search-chip pressable" onClick={() => setPalette(true)}>
            <Search className="h-4 w-4" aria-hidden />
            <span className="hidden min-w-0 flex-1 truncate text-left sm:inline">Search <span className="hidden xl:inline">projects, deployments, servers…</span></span>
            <span className="kbd">{macShortcut ? "⌘K" : "Ctrl K"}</span>
          </button>
          {pathname === "/" ? <Link href="/projects/new" className="btn btn-primary pressable header-action"><Plus aria-hidden /><span>New Project</span></Link> : null}
        </header>
        <main id="main">{children}</main>
      </div>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
      <AnimatePresence>
        {drawer ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
            <motion.button
              type="button"
              aria-label="Close navigation"
              className="overlay-scrim z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
            <motion.aside
              className="sidebar-drawer fixed inset-y-0 left-0 z-50 flex w-[min(18rem,86vw)] flex-col bg-[var(--sidebar-bg)] md:hidden"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={reduced ? { duration: 0.12 } : springSheet}
              drag={reduced ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.35, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -70 || info.velocity.x < -500) setDrawer(false)
              }}
            >
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Dialog.Close className="icon-btn absolute right-2 top-3" aria-label="Close navigation"><X aria-hidden /></Dialog.Close>
              <SidebarNav onNavigate={() => setDrawer(false)} />
            </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
      </Dialog.Root>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <Onboarding />
    </div>
  )
}

function crumbLabel(pathname: string): string {
  if (pathname === "/") return "Overview"
  if (pathname.startsWith("/projects/new/")) return "New project"
  const map: Record<string, string> = {
    "/chat": "Ask Arc",
    "/projects": "Projects",
    "/projects/new": "New project",
    "/deployments": "Deployments",
    "/environment": "Environment",
    "/servers": "Servers",
    "/containers": "Containers",
    "/domains": "Domains",
    "/storage": "Storage",
    "/databases": "Databases",
    "/activity": "Activity",
    "/logs": "Logs",
    "/metrics": "Metrics",
    "/pipelines": "Pipelines",
    "/events": "Events",
    "/alerts": "Alerts",
    "/docs": "Docs",
    "/notifications": "Notifications",
    "/settings": "Settings",
    "/profile": "Profile",
  }
  if (map[pathname]) return map[pathname]
  if (pathname.startsWith("/projects/")) return "Project"
  if (pathname.startsWith("/deployments/")) return "Deployment"
  if (pathname.startsWith("/servers/")) return "Server"
  return "Deploy"
}
