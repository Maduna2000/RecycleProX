'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Minus, X } from 'lucide-react'
import { getModuleName } from '@/lib/module-names'
import { getPageWidthCap } from '@/lib/pageWidthCaps'
import { useWindowStore } from '@/stores/windowStore'
import { useTitleBarActionsStore } from '@/stores/titleBarActionsStore'
import { BAR_GRAD, winBevel, windowTitleText } from '@/components/rpx'

interface PageTitleBarProps {
  /** Override the default module name with a custom title (e.g., record name for detail pages) */
  title?: string | null
}

/** A real Win32-style window control button — hard raised bevel, pushes in
 * on click, matching Btn's press behaviour (see components/rpx/Btn.tsx). */
function WindowControlButton({
  icon: Icon,
  label,
  onClick,
  dangerHover,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  dangerHover?: boolean
}) {
  const [pressed, setPressed] = useState(false)
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title={label}
      aria-label={label}
      style={{
        width: 22, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: pressed ? 'linear-gradient(180deg,#D4D4D4 0%,#EAEAEA 100%)' : BAR_GRAD,
        borderRadius: 2, cursor: 'pointer',
        transform: pressed ? 'translateY(1px)' : undefined,
        color: dangerHover && hover ? '#C0392B' : '#495057',
        ...winBevel(pressed),
      }}
    >
      <Icon style={{ width: 12, height: 12 }} />
    </button>
  )
}

export function PageTitleBar({ title }: PageTitleBarProps = {}) {
  const pathname = usePathname()
  const router   = useRouter()
  const { windows, closeWindow } = useWindowStore()
  const titleBarActions = useTitleBarActionsStore((s) => s.actions)
  // widthCap still centers/caps the bar's own width to match the page's
  // content below (see pageWidthCaps.ts) — but the window chrome itself
  // (gradient, bevel, border, rounded top corners) is unconditional now, so
  // every page's title bar fuses with its content card the same way,
  // capped or full-width.
  const widthCap = getPageWidthCap(pathname)

  const entry = windows.find(w => w.href === pathname)

  function handleMinimize() {
    const idx = windows.findIndex(w => w.href === pathname)
    if (windows.length <= 1 || idx === -1) {
      router.push('/app/dashboard')
      return
    }
    const targetIdx = idx > 0 ? idx - 1 : 1
    const target    = windows[targetIdx]
    router.push(target?.href ?? '/app/dashboard')
  }

  function handleClose() {
    if (!entry) { router.push('/app/dashboard'); return }
    closeWindow(entry.id, (href) => router.push(href))
  }

  // Use provided title if available, otherwise fall back to module name
  const displayTitle = title ?? getModuleName(pathname)

  return (
    <div
      className="flex items-center shrink-0 px-3 select-none"
      style={{
        height: 34,
        background: BAR_GRAD,
        borderRadius: '3px 3px 0 0',
        ...winBevel(),
        ...(widthCap !== null
          ? { width: '100%', maxWidth: widthCap, margin: '0 auto' }
          : {}),
      }}
    >
      <span className="shrink-0" style={windowTitleText}>
        {displayTitle}
      </span>
      <div className="flex-1 min-w-0" />
      {titleBarActions && (
        <div className="flex items-center gap-2 mr-2 min-w-0">
          {titleBarActions}
        </div>
      )}
      <div className="flex items-center gap-1 shrink-0">
        <WindowControlButton icon={Minus} label="Minimise" onClick={handleMinimize} />
        <WindowControlButton icon={X} label="Close" onClick={handleClose} dangerHover />
      </div>
    </div>
  )
}
