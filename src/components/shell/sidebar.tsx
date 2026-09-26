"use client"

import * as Tooltip from "@radix-ui/react-tooltip"
import { ChevronLeft, ChevronRight, ChevronsUpDown, CircleUser, Server, Minus, Code2, HelpCircle, LogOut, Settings as SettingsIcon } from "lucide-react"
import { NAV_GROUPS, DOCS_ITEM, SETTINGS_ITEM, NOTIFICATIONS_ITEM, isNavActive, type NavItem } from "@/components/nav"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useSyncExternalStore } from "react"
import { ArcelliteMark } from "@/components/brand"
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/overlays"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/cn"
import { useDeployState } from "@/lib/deploy/react"

const SIDEBAR_KEY = "arcellite-deploy-sidebar"
const APP_VERSION = "0.1.0"

const DIVIDER = "var(--sidebar-divider)"
const TEXT_ON = "var(--sidebar-text-active)"
const HOVER = "var(--sidebar-hover)"
const BOTTOM = [DOCS_ITEM, SETTINGS_ITEM, NOTIFICATIONS_ITEM]

function sidebarCollapsed() {
  return document.documentElement.dataset.sidebar === "collapsed"
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    (listener) => {
      window.addEventListener("arcellite-sidebar", listener)
      return () => window.removeEventListener("arcellite-sidebar", listener)
    },
    sidebarCollapsed,
    () => false,
  )
  function set(next: boolean) {
    document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded"
    try { window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded") } catch { /* Collapse still works when storage is unavailable. */ }
    window.dispatchEvent(new Event("arcellite-sidebar"))
  }
  return { collapsed, toggle: () => set(!collapsed) }
}

function SidebarTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: React.ReactNode }) {
  if (!enabled) return children
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal>
    <Tooltip.Content side="right" sideOffset={10} className="sidebar-tooltip">{label}</Tooltip.Content>
  </Tooltip.Portal></Tooltip.Root>
}

function FlatLink({ label, icon: Icon, href, count, collapsed, pathname, onNavigate, nested }: NavItem & {
  nested?: boolean; count?: number; collapsed: boolean; pathname: string; onNavigate?: () => void
}) {
  const showIcon = !nested || collapsed
  return <SidebarTooltip label={label} enabled={collapsed}>
    <Link href={href} onClick={onNavigate} aria-label={label}
      aria-current={isNavActive(pathname, href) ? "page" : undefined}
      className="sidebar-link" data-nested={nested} data-collapsed={collapsed}>
      {showIcon && <Icon aria-hidden />}
      {!collapsed && <><span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="sidebar-count">{count}</span>}</>}
    </Link>
  </SidebarTooltip>
}

export function SidebarNav({
  collapsed = false,
  onNavigate,
  onToggle,
}: {
  collapsed?: boolean
  onNavigate?: () => void
  onToggle?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const state = useDeployState()
  const name = state?.settings.displayName ?? "Robera"
  const workspace = state?.settings.workspaceName ?? "Arcellite Lab"
  // No counters until the workspace has loaded, so they never flash "0".
  const counts: Record<string, number> = state ? {
    "/containers": state.containers.length,
    "/domains": state.domains.length,
    "/storage": state.volumes.length,
    "/databases": state.databases.length,
  } : {}

  return (
    <>
      <div
        className={cn("flex h-14 shrink-0 items-center px-4", collapsed && "justify-center px-0")}
        style={{ borderBottom: `1px solid ${DIVIDER}` }}
      >
        <Link href="/" onClick={onNavigate} className={cn("flex min-w-0 items-center gap-2", collapsed && "justify-center")} aria-label="Arcellite Deploy">
          <ArcelliteMark className="h-5 w-5 shrink-0 text-brand" />
          {!collapsed && (
            <span className="flex items-center">
              <span className="text-[17px] font-bold leading-none tracking-tight text-white">Arcellite</span>
              <span className="text-[17px] font-bold leading-none" style={{ color: "var(--brand-primary)" }}>.</span>
              <span className="sidebar-deploy-badge">Deploy</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="sidebar-navigation" aria-label="Main navigation">
        {NAV_GROUPS.map((group, index) => <div className="sidebar-section" key={group.id}>
          {index > 0 && !collapsed && <p className="sidebar-section-label">{group.id === "infrastructure" && <Server aria-hidden />}<span>{group.label}</span>{group.id === "infrastructure" && <Minus aria-hidden className="section-minus" />}</p>}
          {group.items.map((item) => <FlatLink key={item.href} {...item} count={counts[item.href]}
            nested={group.id === "infrastructure"} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />)}
        </div>)}
      </nav>

      <div className="shrink-0 px-2 pb-1 pt-2" style={{ borderTop: `1px solid ${DIVIDER}` }}>
        <div className="space-y-[1px]">
          {BOTTOM.map((item) => (
            <FlatLink key={item.href} {...item} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>

        <Menu
          side="top"
          align="start"
          contentClassName="menu-dark w-56"
          trigger={
            <button
              type="button"
              aria-label={`${name}, ${workspace} profile menu`}
              title={collapsed ? `${name} · ${workspace}` : undefined}
              className={cn(
                "sidebar-profile mt-2 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors",
                collapsed && "justify-center px-0",
              )}
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${DIVIDER}` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)"
              }}
            >
              <div className="relative shrink-0">
                <span className="grid size-8 place-items-center rounded-full bg-white/10 text-[13px] font-semibold text-white">
                  {name.slice(0, 1)}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-zinc-800 bg-emerald-400" aria-hidden />
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[12px] font-semibold leading-none" style={{ color: TEXT_ON }}>
                      {name}
                    </p>
                    <p className="mt-[3px] truncate text-[10px]" style={{ color: "rgba(255,255,255,0.32)" }}>
                      {workspace}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />
                </>
              )}
            </button>
          }
        >
          <div className="px-2 pb-2 pt-1.5">
            <p className="truncate text-[13px] font-semibold text-white">{name}</p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">{workspace}</p>
          </div>
          <MenuSeparator />
          <MenuItem onSelect={() => router.push("/profile")}>
            <CircleUser className="h-3.5 w-3.5" /> Profile
          </MenuItem>
          <MenuItem onSelect={() => router.push("/settings")}>
            <SettingsIcon className="h-3.5 w-3.5" /> Workspace settings
          </MenuItem>
          <MenuItem onSelect={() => router.push("/settings?section=Advanced")}>
            <Code2 className="h-3.5 w-3.5" /> Developer tools
          </MenuItem>
          <MenuItem onSelect={() => router.push("/docs")}>
            <HelpCircle className="h-3.5 w-3.5" /> Help & docs
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            danger
            onSelect={() =>
              toast({
                title: "No account to sign out of",
                description: "Phase 1 keeps this workspace in the browser.",
              })
            }
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </MenuItem>
        </Menu>

        <div className="mt-1 flex items-center gap-1">
          {!collapsed ? (
            <Link
              href="/settings"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-normal transition-colors"
              style={{ color: "rgba(255,255,255,0.25)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = HOVER
                e.currentTarget.style.color = "rgba(255,255,255,0.5)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.color = "rgba(255,255,255,0.25)"
              }}
            >
              <span className="shrink-0 font-mono font-normal">v{APP_VERSION}</span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-lg px-2 transition-colors",
                collapsed ? "w-full justify-center" : "justify-end gap-1",
              )}
              style={{ color: "rgba(255,255,255,0.18)", fontSize: "11px", fontWeight: 400, lineHeight: "16px", letterSpacing: "0" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = HOVER
                e.currentTarget.style.color = "rgba(255,255,255,0.5)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.color = "rgba(255,255,255,0.18)"
              }}
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <>
                  <span>Collapse</span>
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebarCollapsed()
  return (
    <aside className="sidebar font-normal" data-collapsed={collapsed ? "true" : "false"} aria-label="Sidebar">
      <div className="flex h-full min-h-0 flex-col">
        <SidebarNav collapsed={collapsed} onToggle={toggle} />
      </div>
    </aside>
  )
}
