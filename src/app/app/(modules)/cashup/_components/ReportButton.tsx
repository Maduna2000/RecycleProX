'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { CashupReportType } from '@/lib/schemas/cashup'
import { LegacyBtn } from './LegacyBtn'

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

  return (
    <LegacyBtn
      size="sm"
      icon={FileText}
      loading={loading}
      disabled={disabled}
      onClick={handleClick}
      title={disabled ? 'No records for this session yet' : `Download ${label ?? 'Report'}`}
      style={{ justifyContent: fullWidth ? 'center' : 'flex-start', width: fullWidth ? '100%' : 'auto' }}
    >
      {label ?? 'Report'}
    </LegacyBtn>
  )
}
