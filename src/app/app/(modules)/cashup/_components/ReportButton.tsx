'use client'

import React, { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'
import type { CashupReportType } from '@/lib/schemas/cashup'

interface ReportButtonProps {
  type: CashupReportType
  sessionId: string
  disabled?: boolean
  label?: string
  fullWidth?: boolean
  /** For unpaid-all reports that don't require a session */
  standalone?: boolean
}

export function ReportButton({
  type,
  sessionId,
  disabled = false,
  label,
  fullWidth = false,
  standalone = false,
}: ReportButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (disabled || loading) return

    setLoading(true)
    try {
      const url = standalone
        ? `/api/cashup/reports/unpaid?scope=all`
        : `/api/cashup/${sessionId}/reports?type=${type}`

      const res = await fetch(url)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to generate report')
      }

      // Download the PDF
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${type}-report.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)

      toast.success('Report downloaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download report'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const buttonStyle: React.CSSProperties = {
    fontSize: 10,
    padding: fullWidth ? '6px 12px' : '1px 6px',
    background: disabled ? '#F0F0F0' : '#E0E0E0',
    border: `1px solid ${disabled ? '#CCC' : '#999'}`,
    borderRadius: 2,
    cursor: disabled ? 'not-allowed' : loading ? 'wait' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: fullWidth ? 'center' : 'flex-start',
    gap: 4,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    width: fullWidth ? '100%' : 'auto',
    color: disabled ? colors.textMuted : colors.textPrimary,
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      style={buttonStyle}
      onMouseEnter={(e) => {
        if (!disabled && !loading) e.currentTarget.style.background = '#D0D0D0'
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) e.currentTarget.style.background = '#E0E0E0'
      }}
      title={disabled ? 'Submit session to enable reports' : `Download ${label ?? 'Report'}`}
    >
      {loading ? (
        <>
          <Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />
          <span>Loading...</span>
        </>
      ) : (
        <>
          <FileText style={{ width: 9, height: 9 }} />
          <span>{label ?? 'Report'}</span>
        </>
      )}
    </button>
  )
}
