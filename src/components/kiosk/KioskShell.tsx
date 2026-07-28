'use client'

/**
 * Shared presentational chrome for the two kiosk step-flows (Gate visitor
 * entry, Scale weigh-in) — the Back-button/step-label header row and the
 * segmented progress bar underneath. Forward progress has no single generic
 * hook (each step's own submit/selection action calls its own `onNext`), so
 * this shell only owns "Back" — never "Next." `CheckOutMode` (Gate) and the
 * desktop-only step sidebar (Scale) are neither of these things and stay
 * outside/alongside this shell, unchanged.
 */

import { ChevronLeft } from 'lucide-react'

export interface KioskShellProps {
  /** 1-indexed current step. */
  current: number
  total: number
  stepLabel: string
  canGoBack: boolean
  onBack: () => void
  /** Per-kiosk accent — Gate's blue, Scale's green. Purely cosmetic. */
  accentColor: string
  /** Gate's "Check Out" button / Scale's cart-count badge — anything else that belongs in the header's right edge. */
  rightSlot?: React.ReactNode
  background?: string
  children: React.ReactNode
}

export function KioskShell({
  current, total, stepLabel, canGoBack, onBack, accentColor, rightSlot, background, children,
}: KioskShellProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background }}>
      <div className="bg-white px-3 sm:px-6 py-2.5 shrink-0 flex items-center gap-2 sm:gap-3">
        {canGoBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-slate-500 text-sm font-medium min-h-[44px] px-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <div className="w-2 shrink-0" />
        )}
        <span className="text-sm text-slate-400 font-medium tabular-nums">Step {current} of {total}</span>
        <span className="text-sm font-semibold text-slate-700 truncate hidden sm:block">— {stepLabel}</span>
        {rightSlot && <div className="ml-auto flex items-center gap-2 shrink-0">{rightSlot}</div>}
      </div>

      <div className="flex gap-1.5 px-4 sm:px-6 pt-3 pb-2.5 bg-white border-b border-slate-200 shrink-0">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#E7EBF1' }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: i < current - 1 ? '100%' : i === current - 1 ? '50%' : '0%',
                background: i <= current - 1 ? accentColor : 'transparent',
              }}
            />
          </div>
        ))}
      </div>

      {children}
    </div>
  )
}
