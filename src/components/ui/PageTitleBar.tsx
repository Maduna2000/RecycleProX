'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Minus, X } from 'lucide-react'
import { getModuleName } from '@/lib/module-names'
import { getPageWidthCap } from '@/lib/pageWidthCaps'
import { useWindowStore } from '@/stores/windowStore'
import { useTitleBarActionsStore } from '@/stores/titleBarActionsStore'

interface PageTitleBarProps {
  /** Override the default module name with a custom title (e.g., record name for detail pages) */
  title?: string | null
}

export function PageTitleBar({ title }: PageTitleBarProps = {}) {
  const pathname = usePathname()
  const router   = useRouter()
  const { windows, closeWindow } = useWindowStore()
  const titleBarActions = useTitleBarActionsStore((s) => s.actions)
  // Pages that cap their own content to a centered, narrower block (see
  // pageWidthCaps.ts) get this bar capped and bordered to match, so it fuses
  // into one framed box with the content beneath instead of spanning the
  // full window width above a narrower page. Every other page is unaffected.
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
        height:      28,
        background:  'rgba(27,58,107,0.05)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        // Matches the page's own capped-and-centered ContentCard (see that
        // page's cardStyle) — same width, same border color/weight on every
        // side but the bottom, and rounded top corners meeting ContentCard's
        // own squared-off top (borderTop: 'none' there) — so the two fuse
        // into one continuous framed box instead of a separate strip
        // floating above it.
        ...(widthCap !== null && {
          // width: '100%' is required alongside maxWidth here — without it,
          // this flex item shrinks to fit its own text ("BAN001 ⁠— ✕") rather
          // than stretching to the cap first and then being centered by the
          // auto margins, which is what actually produced a tiny floating
          // pill in testing.
          width:    '100%',
          maxWidth: widthCap,
          margin:   '0 auto',
          border:   '1px solid #B0B0B0',
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        }),
      }}
    >
      <span className="text-[12px] font-semibold text-[#374151] shrink-0">
        {displayTitle}
      </span>
      <div className="flex-1 min-w-0" />
      {titleBarActions && (
        <div className="flex items-center gap-2 mr-2 min-w-0">
          {titleBarActions}
        </div>
      )}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={handleMinimize}
          title="Minimise"
          aria-label="Minimise page"
          className="w-7 h-7 flex items-center justify-center rounded text-[#6B7280] hover:text-[#374151] hover:bg-black/5 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClose}
          title="Close"
          aria-label="Close page"
          className="w-7 h-7 flex items-center justify-center rounded text-[#6B7280] hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
