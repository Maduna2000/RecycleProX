'use client'

/**
 * Zone 2's unified action toolbar — replaces the old per-pathname
 * if-chain (previously ~106 lines inline in AppShell.tsx) with one
 * declarative registry (toolbarActions.ts). Every action always renders,
 * in registry order with a divider between groups; only the ones relevant
 * to the current page (and, for the 4 dynamic ones, actually applicable to
 * the current record) are enabled — the classic MT4/Office "always there,
 * greyed when it doesn't apply" toolbar, not a toolbar that reshuffles
 * itself per page.
 *
 * Buttons are flat until interacted with (no border/bevel at rest) —
 * deliberately different from this app's regular `Btn`, which is always
 * visibly raised. That flatness is what lets ~15 buttons read as one clean
 * strip instead of a wall of boxes.
 */

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { TOOLBAR_ACTIONS, actionMatchesRoute, type ToolbarAction } from '@/lib/toolbarActions'
import { useToolbarActionStore } from '@/stores/toolbarActionStore'
import { findModuleKey } from '@/lib/moduleKeys'
import { winBevel } from '@/components/rpx'

function ToolbarButton({ action, enabled, active, onClick }: { action: ToolbarAction; enabled: boolean; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)
  const Icon = action.icon

  // `active` = a navigation button (Stock/Gate/Scale view switchers) whose
  // own destination is the page you're currently on — stays permanently
  // sunken, like a selected tool in a classic Win32/MT4 toolbar, so you can
  // tell which view is current without a separate tab strip.
  const style: React.CSSProperties = {
    width: 26, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 2, cursor: enabled ? 'pointer' : 'default',
    ...(enabled && (pressed || active)
      ? { background: '#C3DFFF', ...winBevel(true) }
      : enabled && hover
        ? { background: '#D6E8FF', border: '1px solid #1B3A6B' }
        : { background: 'transparent', border: '1px solid transparent' }),
  }

  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.label}
      disabled={!enabled}
      onClick={onClick}
      onMouseEnter={() => enabled && setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false) }}
      onMouseDown={() => enabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={style}
    >
      <Icon style={{ width: 15, height: 15, opacity: enabled ? 1 : 0.35, color: '#212529' }} />
    </button>
  )
}

export function Toolbar({ role, allowedModules }: { role: string; allowedModules?: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const overrides = useToolbarActionStore((s) => s.overrides)

  // Role-gated actions don't render at all for a user without that role —
  // same as the old system (an admin-only button was never shown to a
  // non-admin, not just disabled). Module-gated actions follow the exact
  // same allowedModules rule middleware.ts enforces on the route itself
  // (empty/undefined allowedModules = no restriction; a non-empty list
  // restricts to just those module keys) — a manager who's had Settings
  // revoked never sees a Settings button to begin with, same as they can't
  // navigate there.
  const visibleActions = TOOLBAR_ACTIONS.filter((a) => {
    if (a.roles && !a.roles.includes(role)) return false
    if (allowedModules && allowedModules.length > 0 && a.routes[0]) {
      const moduleKey = findModuleKey(a.routes[0])
      if (moduleKey && !allowedModules.includes(moduleKey)) return false
    }
    return true
  })

  // Group in registry order (already grouped there), Office-ribbon style —
  // each group renders as its own bordered cluster with a caption naming
  // it, so a wall of 15 icons reads as 9 named clusters instead of one
  // undifferentiated row.
  const groups: { name: string; actions: ToolbarAction[] }[] = []
  for (const action of visibleActions) {
    const last = groups[groups.length - 1]
    if (last && last.name === action.group) last.actions.push(action)
    else groups.push({ name: action.group, actions: [action] })
  }

  return (
    <div className="flex items-stretch gap-1">
      {groups.map((group, i) => (
        <div
          key={group.name}
          className="flex flex-col items-center justify-between px-1.5 py-0.5"
          style={i < groups.length - 1 ? { borderRight: '1px solid #D0D0D0', boxShadow: '1px 0 0 #FFFFFF' } : undefined}
        >
          <div className="flex items-center gap-0.5">
            {group.actions.map((action) => {
              const override = overrides[action.id]
              const onRelevantRoute = actionMatchesRoute(action, pathname)
              const enabled = action.href
                ? onRelevantRoute
                : onRelevantRoute && !!override?.enabled
              // Only ever true for nav-style buttons (Stock/Gate/Scale view
              // switchers), whose href IS one of their own group's routes —
              // a one-shot action's href always points elsewhere, so this
              // never lights up for those.
              const active = action.href === pathname

              function handleClick() {
                if (action.href) router.push(action.href!)
                else override?.onClick()
              }

              return <ToolbarButton key={action.id} action={action} enabled={enabled} active={active} onClick={handleClick} />
            })}
          </div>
          <span
            className="whitespace-nowrap select-none"
            style={{ fontSize: 9, lineHeight: '11px', letterSpacing: '0.02em', color: '#6B7684', marginTop: 1 }}
          >
            {group.name}
          </span>
        </div>
      ))}
    </div>
  )
}
