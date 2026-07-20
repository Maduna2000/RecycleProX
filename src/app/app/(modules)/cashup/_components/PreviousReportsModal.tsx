'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { FileText, Loader2, CheckCircle2, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import Decimal from 'decimal.js'
import { CASHUP_REPORT_LABELS, type CashupReportType, CURRENCY_SYMBOLS } from '@/lib/schemas/cashup'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface SessionRecord {
  id: string
  sessionDate: string
  status: string
  currency: string
  variance: string | null
  openingBalance: string
  declaredCash: string | null
  submittedAt: string | null
  approvedAt: string | null
}

interface PreviousReportsModalProps {
  onClose: () => void
}

// Report types that make sense for historical sessions
const AVAILABLE_REPORT_TYPES: CashupReportType[] = [
  'cash-sales',
  'cash-purchases',
  'account-payments',
  'expenses',
  'loan-advances',
  'loan-repayments',
  'unpaid-today',
  'card-sales',
  'transferred-purchases',
  'drawings-received',
]

export function PreviousReportsModal({ onClose }: PreviousReportsModalProps) {
  const { data, isLoading, error } = useSWR<{ sessions: SessionRecord[]; total: number }>(
    '/api/cashup/history?take=50',
    fetcher
  )

  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedReports, setSelectedReports] = useState<Set<CashupReportType>>(new Set())
  const [downloading, setDownloading] = useState(false)

  const sessions = data?.sessions ?? []

  function toggleReport(type: CashupReportType) {
    const next = new Set(selectedReports)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    setSelectedReports(next)
  }

  function selectAll() {
    setSelectedReports(new Set(AVAILABLE_REPORT_TYPES))
  }

  function deselectAll() {
    setSelectedReports(new Set())
  }

  async function handleDownload() {
    if (!selectedSession || selectedReports.size === 0) {
      toast.error('Please select a session and at least one report type')
      return
    }

    setDownloading(true)
    let successCount = 0
    let failCount = 0

    for (const type of Array.from(selectedReports)) {
      try {
        const res = await fetch(`/api/cashup/${selectedSession}/reports?type=${type}`)
        if (!res.ok) {
          failCount++
          continue
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${type}-report.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        successCount++

        // Small delay between downloads to avoid browser issues
        await new Promise((r) => setTimeout(r, 300))
      } catch {
        failCount++
      }
    }

    setDownloading(false)

    if (successCount > 0) {
      toast.success(`Downloaded ${successCount} report${successCount > 1 ? 's' : ''}`)
    }
    if (failCount > 0) {
      toast.error(`Failed to download ${failCount} report${failCount > 1 ? 's' : ''}`)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={720}>
        <RpxDialogHeader title="Previous Session Reports" onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm" style={{ color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading sessions...
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-sm" style={{ color: colors.danger }}>
              Failed to load sessions
            </div>
          )}

          {!isLoading && !error && sessions.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: colors.textSecondary }}>
              No previous sessions found
            </div>
          )}

          {!isLoading && !error && sessions.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Session list */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: colors.textSecondary }}>
                  Select Session
                </p>
                <div
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 3,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  {sessions.map((s, i) => {
                    const dateStr = s.sessionDate.split('T')[0]
                    const variance = s.variance ? new Decimal(s.variance) : null
                    const currSym = CURRENCY_SYMBOLS[s.currency as keyof typeof CURRENCY_SYMBOLS] ?? 'R'
                    const isSelected = selectedSession === s.id

                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedSession(s.id)
                          setSelectedReports(new Set())
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '8px 12px',
                          background: isSelected ? colors.processBg : i % 2 === 0 ? '#fff' : '#FAFAFA',
                          borderTop: i > 0 ? `1px solid ${colors.border}` : undefined,
                          borderLeft: isSelected ? `3px solid ${colors.process}` : '3px solid transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: colors.textSecondary }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>
                            {dateStr}
                          </p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            {s.status === 'approved' ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" style={{ color: colors.action }} />
                                Approved
                              </span>
                            ) : (
                              'Submitted'
                            )}
                            {variance && (
                              <span
                                className="ml-2"
                                style={{
                                  color: variance.isZero() ? colors.action : variance.gt(0) ? colors.process : colors.danger,
                                }}
                              >
                                {variance.gt(0) ? '+' : ''}{currSym} {variance.toFixed(2)}
                              </span>
                            )}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Right: Report type selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                    Select Reports
                  </p>
                  {selectedSession && (
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="text-xs"
                        style={{ color: colors.process, cursor: 'pointer' }}
                      >
                        All
                      </button>
                      <span style={{ color: colors.textMuted }}>|</span>
                      <button
                        onClick={deselectAll}
                        className="text-xs"
                        style={{ color: colors.textSecondary, cursor: 'pointer' }}
                      >
                        None
                      </button>
                    </div>
                  )}
                </div>

                {!selectedSession ? (
                  <div
                    className="flex items-center justify-center text-sm"
                    style={{
                      border: `1px dashed ${colors.border}`,
                      borderRadius: 3,
                      height: 280,
                      color: colors.textSecondary,
                    }}
                  >
                    Select a session first
                  </div>
                ) : (
                  <div
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 3,
                      maxHeight: 280,
                      overflowY: 'auto',
                    }}
                  >
                    {AVAILABLE_REPORT_TYPES.map((type, i) => {
                      const isSelected = selectedReports.has(type)
                      return (
                        <label
                          key={type}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                            borderTop: i > 0 ? `1px solid ${colors.border}` : undefined,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleReport(type)}
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: colors.textSecondary }} />
                          <span className="text-sm" style={{ color: colors.textPrimary }}>
                            {CASHUP_REPORT_LABELS[type]}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </RpxDialogBody>
        <RpxDialogFooter style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            {selectedSession
              ? `${selectedReports.size} report${selectedReports.size !== 1 ? 's' : ''} selected`
              : 'Select a session to view reports'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={onClose} disabled={downloading}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={handleDownload}
              disabled={!selectedSession || selectedReports.size === 0 || downloading}
              loading={downloading}
            >
              Download {selectedReports.size > 0 ? `(${selectedReports.size})` : ''}
            </Btn>
          </div>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
