'use client'

import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { colors, fontSize } from '@/lib/design-tokens'

interface TradeCommoditiesSelectProps {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  /** Match the surrounding form's field styling exactly — no built-in look of its own. */
  className?: string
  style?: React.CSSProperties
}

/**
 * Closed-by-default multi-select dropdown: click to open a checkbox list,
 * click outside to close. Flips to open upward when there isn't room below
 * (same measure-then-flip approach as DataTable.tsx's ActionsDropdown), so
 * it never renders off-screen regardless of where it sits in a form.
 */
export function TradeCommoditiesSelect({ options, value, onChange, disabled, className, style }: TradeCommoditiesSelectProps) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function handleToggleOpen() {
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
        className={className}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
          ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value.length === 0 ? colors.textSecondary : undefined }}>
          {value.length === 0 ? 'Select commodities…' : value.join(', ')}
        </span>
        <ChevronDown style={{ width: 14, height: 14, flexShrink: 0, color: colors.textSecondary }} />
      </button>
      {open && !disabled && (
        <div
          style={{
            position: 'absolute', zIndex: 20, left: 0, right: 0,
            ...(openUpward ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
            maxHeight: 220, overflowY: 'auto',
            border: `1px solid ${colors.border}`, borderRadius: 4, background: colors.surface,
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
