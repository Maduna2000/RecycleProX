'use client'

/** Right-hand slide-over detail drawer (officer-portal look). */

import { X } from 'lucide-react'
import { NAVY, BAR_GRAD } from './styles'

export function Drawer({
  title,
  onClose,
  maxWidth = 520,
  children,
}: {
  title: string
  onClose: () => void
  maxWidth?: number
  children: React.ReactNode
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '100%', maxWidth, background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '2px solid #9E9E9E', background: BAR_GRAD, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X style={{ width: 16, height: 16, color: '#495057' }} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
