'use client'

import { useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

interface TradeCommoditiesSelectProps {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * Multi-select dropdown styled like the Reports filter selects (FilterSelect /
 * CustomerSearchSelect in ReportViewer.tsx): plain border/white when empty,
 * a tinted blue fill + border once something is selected. Flips to open
 * upward when there isn't room below (same measure-then-flip approach as
 * DataTable.tsx's ActionsDropdown), so it never renders off-screen.
 */
export function TradeCommoditiesSelect({ options, value, onChange, disabled }: TradeCommoditiesSelectProps) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const active = value.length > 0

  function handleToggleOpen() {
    if (disabled) return
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const estimatedPanelH = Math.min(220, Math.max(options.length, 1) * 30 + 8)
      setOpenUpward(rect.bottom + estimatedPanelH > window.innerHeight - 8)
    }
    setOpen((o) => !o)
  }

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggleOpen}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center h-9 w-full rounded-md px-2 text-sm outline-none"
        style={{
          border: `1px solid ${active ? colors.process : colors.border}`,
          background: disabled ? colors.neutralBg : active ? colors.processBg : colors.surface,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <span
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: active ? colors.textPrimary : colors.textSecondary,
            fontWeight: active ? fontWeight.medium : fontWeight.regular,
          }}
        >
          {active ? value.join(', ') : 'Select commodities…'}
        </span>
        {active && !disabled && (
          <span
            role="button"
            aria-label="Clear trade commodities"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: colors.textSecondary, cursor: 'pointer' }}
          >
            <X style={{ width: 12, height: 12 }} />
          </span>
        )}
        <ChevronDown style={{ width: 14, height: 14, flexShrink: 0, marginLeft: 4, color: colors.textSecondary }} />
      </button>
      {open && !disabled && (
        <div
          style={{
            position: 'absolute', zIndex: 20, left: 0, right: 0,
            ...(openUpward ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
            maxHeight: 220, overflowY: 'auto',
            border: `1px solid ${colors.border}`, borderRadius: 6, background: colors.surface,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: fontSize.sm, color: colors.textSecondary }}>
              No categories configured
            </div>
          ) : options.map((opt) => (
            <label
              key={opt}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(opt)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                fontSize: fontSize.sm, cursor: 'pointer', color: colors.textPrimary,
              }}
            >
              <input type="checkbox" checked={value.includes(opt)} readOnly style={{ width: 13, height: 13 }} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
