'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Minus, Square, Copy, X } from 'lucide-react'
import { getModuleName } from '@/lib/module-names'
import { useWindowStore } from '@/stores/windowStore'
import { useTitleBarActionsStore } from '@/stores/titleBarActionsStore'
import { BAR_GRAD, winBevel, windowTitleText } from '@/components/rpx'

interface PageTitleBarProps {
  /** Override the default module name with a custom title (e.g., record name for detail pages) */
  title?: string | null
  /** Whether the enclosing window is currently maximized — swaps the
   * maximize icon for a "restore" one, matching real Win32 chrome. Omit
   * (or leave both maximize props out) to hide the control entirely, e.g.
   * when PageTitleBar renders outside FloatingWindowFrame. */
  isMaximized?: boolean
  onMaximizeToggle?: () => void
  /** Starts a move-drag — wired by FloatingWindowFrame, which owns the
   * actual geometry math. Omit to render a non-draggable bar. */
  onTitleBarMouseDown?: (e: React.MouseEvent) => void
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
      onMouseDown={(e) => { e.stopPropagation(); setPressed(true) }}
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

export function PageTitleBar({ title, isMaximized, onMaximizeToggle, onTitleBarMouseDown }: PageTitleBarProps = {}) {
  const pathname = usePathname()
  const router   = useRouter()
  const { windows, closeWindow } = useWindowStore()
  const titleBarActions = useTitleBarActionsStore((s) => s.actions)

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
      onMouseDown={onTitleBarMouseDown}
      className="flex items-center shrink-0 px-3 select-none"
      style={{
        height: 34,
        width: '100%',
        background: BAR_GRAD,
        borderRadius: '3px 3px 0 0',
        cursor: onTitleBarMouseDown ? 'move' : undefined,
        ...winBevel(),
      }}
    >
      <span className="shrink-0" style={windowTitleText}>
        {displayTitle}
      </span>
      <div className="flex-1 min-w-0" />
      {titleBarActions && (
        <div className="flex items-center gap-2 mr-2 min-w-0" onMouseDown={(e) => e.stopPropagation()}>
          {titleBarActions}
        </div>
      )}
      <div className="flex items-center gap-1 shrink-0">
        <WindowControlButton icon={Minus} label="Minimise" onClick={handleMinimize} />
        {onMaximizeToggle && (
          <WindowControlButton
            icon={isMaximized ? Copy : Square}
            label={isMaximized ? 'Restore' : 'Maximise'}
            onClick={onMaximizeToggle}
          />
        )}
        <WindowControlButton icon={X} label="Close" onClick={handleClose} dangerHover />
      </div>
    </div>
  )
}
