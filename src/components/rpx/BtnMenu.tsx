'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Btn, type BtnVariant, type BtnSize } from './Btn'

export interface BtnMenuItem {
  label:    string
  icon?:    React.ElementType
  href?:    string
  onClick?: () => void
}

/**
 * A Btn that opens a small dropdown of actions — used for multi-format
 * exports (Excel / PDF) and similar grouped actions.
 */
export function BtnMenu({
  label,
  icon,
  variant = 'secondary',
  size = 'md',
  loading,
  disabled,
  align = 'left',
  items,
}: {
  label:     string
  icon?:     React.ElementType
  variant?:  BtnVariant
  size?:     BtnSize
  loading?:  boolean
  disabled?: boolean
  align?:    'left' | 'right'
  items:     BtnMenuItem[]
}) {
  const [open, setOpen] = useState(false)

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '6px 12px', fontSize: 12, color: '#212529',
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left', textDecoration: 'none', whiteSpace: 'nowrap',
  }

  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = '#F1F3F4' },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'none' },
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <Btn
        variant={variant}
        size={size}
        icon={icon}
        loading={loading}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDown style={{ width: 10, height: 10, flexShrink: 0 }} />
      </Btn>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', top: '100%', marginTop: 4, zIndex: 50,
              ...(align === 'right' ? { right: 0 } : { left: 0 }),
              minWidth: 170, background: '#fff', borderRadius: 3,
              border: '1px solid #D0D0D0', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '4px 0',
            }}
          >
            {items.map((item) => {
              const Icon = item.icon
              const inner = (
                <>
                  {Icon && <Icon style={{ width: 12, height: 12, flexShrink: 0, color: '#6C757D' }} />}
                  {item.label}
                </>
              )
              return item.href ? (
                <Link key={item.label} href={item.href} style={itemStyle} onClick={() => setOpen(false)} {...hover}>
                  {inner}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  style={itemStyle}
                  onClick={() => { setOpen(false); item.onClick?.() }}
                  {...hover}
                >
                  {inner}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
