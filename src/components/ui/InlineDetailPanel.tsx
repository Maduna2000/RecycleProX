'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { NAVY, BAR_GRAD } from '@/components/rpx'

interface InlineDetailPanelProps {
  open:     boolean
  onClose:  () => void
  title?:   string
  children: React.ReactNode
  height?:  number
}

/**
 * Slides up from the bottom of the content area.
 * Animation: translateY(100%) → translateY(0) in 200ms ease-out.
 * Closes on Escape key or the × button.
 */
export function InlineDetailPanel({
  open,
  onClose,
  title,
  children,
  height = 220,
}: InlineDetailPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      ref={ref}
      aria-hidden={!open}
      className="border-t border-[#E0E0E0] bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)] overflow-hidden transition-all"
      style={{
        height:     open ? height : 0,
        transform:  open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'height 200ms ease-out, transform 200ms ease-out',
        flexShrink: 0,
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 34, background: BAR_GRAD, borderBottom: '2px solid #B0B0B0', flexShrink: 0 }}
      >
        {title && (
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>{title}</p>
        )}
        <button
          className="ml-auto p-1 rounded hover:bg-[#E0E0E0] text-[#6C757D] hover:text-[#212529] transition-colors"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-auto px-4 py-3" style={{ height: height - 36 }}>
        {children}
      </div>
    </div>
  )
}
