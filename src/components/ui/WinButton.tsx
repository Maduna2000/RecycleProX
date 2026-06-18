'use client'

import React from 'react'

type WinButtonProps = {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}

export function WinButton({ onClick, disabled, children }: WinButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 10,
        padding: '1px 6px',
        background: '#E0E0E0',
        border: '1px solid #999',
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        opacity: disabled ? 0.6 : 1,
        color: '#212529',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#D0D0D0' }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = '#E0E0E0' }}
    >
      {children}
    </button>
  )
}
