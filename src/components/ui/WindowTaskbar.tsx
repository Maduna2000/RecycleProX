'use client'

import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useWindowStore } from '@/stores/windowStore'

export function WindowTaskbar() {
  const router   = useRouter()
  const pathname = usePathname()
  const { windows, closeWindow } = useWindowStore()

  if (windows.length === 0) return null

  return (
    <div
      className="flex items-center gap-0.5 px-2 shrink-0 border-t border-white/10"
      style={{ height: 24, background: 'rgba(27,58,107,0.88)' }}
    >
      {windows.map((win) => {
        const Icon     = win.icon
        const isActive = pathname === win.href

        return (
          <div
            key={win.id}
            className={cn(
              'flex items-center gap-1 px-2 rounded-sm group cursor-pointer transition-colors',
              isActive
                ? 'bg-white/20 border-t-2 border-t-[#F2AB1A]'
                : 'hover:bg-white/10 border-t-2 border-t-transparent',
            )}
            style={{ height: 20, minWidth: 80, maxWidth: 140 }}
            onClick={() => router.push(win.href)}
            title={win.label}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && router.push(win.href)}
          >
            <Icon className="w-3 h-3 text-white/70 shrink-0" />
            <span className="text-[10px] text-white/80 font-medium truncate flex-1 select-none">
              {win.label}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeWindow(win.id, (href) => router.push(href))
              }}
              aria-label={`Close ${win.label}`}
              className="w-3.5 h-3.5 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-white/20 text-white/70 transition-all shrink-0 text-[11px] leading-none"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
