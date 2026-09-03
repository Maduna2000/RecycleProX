'use client'

/**
 * PDF / Excel download buttons — fetch → blob → anchor click, same pattern
 * as the cash-up module's ReportButton.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2, FileSpreadsheet } from 'lucide-react'
import { ActionButton } from './ActionButton'
import { downloadResponse } from '@/lib/download'

interface DownloadButtonsProps {
  reportId: string
  /** Current validated query params (from/to/filters), without format. */
  params: Record<string, string>
  disabled?: boolean
}

export function DownloadButtons({ reportId, params, disabled }: DownloadButtonsProps) {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)

  async function download(format: 'pdf' | 'xlsx') {
    setBusy(format)
    try {
      const qs = new URLSearchParams({ ...params, format }).toString()
      const res = await fetch(`/api/reports/${reportId}?${qs}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Download failed (${res.status})`)
      }
      await downloadResponse(res, `${reportId}_${params.from}_${params.to}.${format}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-2">
      <ActionButton onClick={() => download('pdf')} disabled={disabled || busy !== null}>
        {busy === 'pdf'
          ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
          : <Download style={{ width: 13, height: 13 }} />} Download PDF
      </ActionButton>
      <ActionButton onClick={() => download('xlsx')} disabled={disabled || busy !== null}>
        {busy === 'xlsx'
          ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
          : <FileSpreadsheet style={{ width: 13, height: 13 }} />} Download Excel
      </ActionButton>
    </div>
  )
}
