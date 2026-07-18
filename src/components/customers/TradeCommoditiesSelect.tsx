'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { colors, fontSize } from '@/lib/design-tokens'

interface TradeCommoditiesSelectProps {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

/** Closed-by-default multi-select dropdown: click to open a checkbox list, click outside to close. */
export function TradeCommoditiesSelect({ options, value, onChange, disabled }: TradeCommoditiesSelectProps) {
  const [open, setOpen] = useState(false)

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', minHeight: 34, padding: '6px 10px',
          border: `1px solid ${colors.border}`, borderRadius: 4,
          background: disabled ? colors.neutralBg : colors.surface,
          fontSize: fontSize.sm, textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
          color: value.length ? colors.textPrimary : colors.textSecondary,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value.length === 0 ? 'Select commodities…' : value.join(', ')}
        </span>
        <ChevronDown style={{ width: 14, height: 14, flexShrink: 0, color: colors.textSecondary }} />
      </button>
      {open && !disabled && (
        <div
          style={{
            position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
            maxHeight: 220, overflowY: 'auto',
            border: `1px solid ${colors.border}`, borderRadius: 4, background: colors.surface,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
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
