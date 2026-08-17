'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Minus, X } from 'lucide-react'
import { getModuleName } from '@/lib/module-names'
import { useWindowStore } from '@/stores/windowStore'

interface PageTitleBarProps {
  /** Override the default module name with a custom title (e.g., record name for detail pages) */
  title?: string | null
}

export function PageTitleBar({ title }: PageTitleBarProps = {}) {
  const pathname = usePathname()
  const router   = useRouter()
  const { windows, closeWindow } = useWindowStore()
  // The Accounts module's customer detail page caps its own content to a
  // centered 960px block (see the customers/[id] page and its tab strip) —
  // match that here so this bar's label/minimise/close controls line up
  // with the page beneath instead of spanning the full window width. Every
  // other module's title bar is unaffected.
  const isAccountsPage = pathname.startsWith('/app/customers')

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
      className="flex items-center shrink-0 px-3 border-b select-none"
      style={{
        height:      28,
        background:  'rgba(27,58,107,0.05)',
        borderColor: 'rgba(0,0,0,0.07)',
      }}
    >
      <div
        className="flex items-center justify-between w-full min-w-0"
        style={isAccountsPage ? { maxWidth: 960, margin: '0 auto' } : undefined}
      >
        <span className="text-[12px] font-semibold text-[#374151]">
          {displayTitle}
        </span>
        <div className="flex items-center gap-0.5">
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
    </div>
  )
}
