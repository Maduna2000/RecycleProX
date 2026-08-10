'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Dialog } from '@/components/ui/dialog'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { format } from '@/lib/utils/format'
import { colors, fontWeight } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import { StatusBadge } from '@/components/ui/DataTable'
import {
  TH, TD, HEADER_GRAD, NAVY,
  Btn, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'


type MomoLine = {
  id: string
  transactionDate: string
  status: string
  type: string
  fromName: string | null
  toName: string | null
  toMessage: string | null
  amount: string
  fee: string
  balance: string | null
}

type MomoDetail = {
  id: string
  fileName: string
  statementDate: string
  totalSent: string
  totalReceived: string
  totalFees: string
  transactionCount: number
  failedCount: number
  openingBalance: string | null
  closingBalance: string | null
  createdAt: string
  lines: MomoLine[]
}

export default function MomoStatementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: statement, isLoading, error } = useSWR<MomoDetail>(`/api/momo-statements/${id}`, fetcher)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary }}>
        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.danger, fontSize: 13 }}>
        {error instanceof Error ? error.message : 'Failed to load statement'}
      </div>
    )
  }
  if (!statement) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary, fontSize: 13 }}>
        Statement not found
      </div>
    )
  }

  return (
    <>
      <PortalPage title={format.date(statement.statementDate)}>
        {/* Sub-header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: colors.textSecondary }}>{statement.fileName}</span>
          <span style={{ fontSize: 10, color: colors.textSecondary, padding: '2px 6px', background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 2 }}>
            Uploaded {format.datetime(statement.createdAt)}
          </span>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Summary tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            <SummaryTile label="Total Sent" value={`R ${new Decimal(statement.totalSent).toFixed(2)}`} color={colors.process} />
            <SummaryTile label="Total Received" value={`R ${new Decimal(statement.totalReceived).toFixed(2)}`} color={colors.action} />
            <SummaryTile label="Total Fees" value={`R ${new Decimal(statement.totalFees).toFixed(2)}`} color={colors.textSecondary} />
            <SummaryTile
              label="Opening → Closing"
              value={
                statement.openingBalance != null && statement.closingBalance != null
                  ? `R ${new Decimal(statement.openingBalance).toFixed(2)} → R ${new Decimal(statement.closingBalance).toFixed(2)}`
                  : '—'
              }
              color={colors.textPrimary}
            />
            <SummaryTile
              label="Transactions"
              value={`${statement.transactionCount}${statement.failedCount > 0 ? ` (${statement.failedCount} failed)` : ''}`}
              color={colors.textPrimary}
            />
          </div>

          {/* Transactions table */}
          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: HEADER_GRAD }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>Transactions</span>
              <span style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 8 }}>{statement.lines.length} rows</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Time</th>
                  <th style={TH}>Type</th>
                  <th style={TH}>From</th>
                  <th style={TH}>To</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Fee</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Balance</th>
                  <th style={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line, i) => {
                  const amt = new Decimal(line.amount)
                  return (
                    <tr
                      key={line.id}
                      style={{ borderBottom: i < statement.lines.length - 1 ? `1px solid ${colors.rowDivider}` : undefined, opacity: line.status === 'Successful' ? 1 : 0.5 }}
                    >
                      <td style={{ ...TD, color: colors.textSecondary }}>
                        {new Date(line.transactionDate).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={TD}>{line.type}</td>
                      <td style={TD}>{line.fromName ?? '—'}</td>
                      <td style={TD}>
                        {line.toName ?? '—'}
                        {line.toMessage && <span style={{ color: colors.textSecondary }}> · {line.toMessage}</span>}
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600, textAlign: 'right', color: amt.isNegative() ? colors.process : colors.action }}>
                        {amt.isNegative() ? '−' : '+'}R {amt.abs().toFixed(2)}
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', color: colors.textSecondary }}>
                        {new Decimal(line.fee).gt(0) ? `R ${new Decimal(line.fee).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', color: colors.textSecondary }}>
                        {line.balance != null ? `R ${new Decimal(line.balance).toFixed(2)}` : '—'}
                      </td>
                      <td style={TD}><StatusBadge status={line.status === 'Successful' ? 'completed' : 'voided'} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #E0E0E0', background: '#F8F9FA', flexShrink: 0 }}>
          <Btn size="sm" onClick={() => router.push('/app/momo-statement')}>Back to List</Btn>
          {isManager && (
            <Btn variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)}>
              Delete Statement
            </Btn>
          )}
        </div>
      </PortalPage>

      {deleteOpen && (
        <DeleteModal
          statement={statement}
          onClose={() => setDeleteOpen(false)}
          onSuccess={() => { router.push('/app/momo-statement') }}
        />
      )}
    </>
  )
}

function SummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <p className="font-mono" style={{ fontSize: 14, fontWeight: fontWeight.bold, color }}>{value}</p>
    </div>
  )
}

// ─── Delete Modal ───────────────────────────────────────────────────────────────
function DeleteModal({ statement, onClose, onSuccess }: { statement: MomoDetail; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    setLoading(true)
    const res = await fetch(`/api/momo-statements/${statement.id}`, { method: 'DELETE' })
    setLoading(false)
    if (res.ok) { toast.success('Statement deleted'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete statement') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title="Delete MoMo Statement" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: 0 }}>
            Delete the statement for{' '}
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>{format.date(statement.statementDate)}</span>?
            This only removes the imported record — it has no effect on Purchases, Sales, or the actual MoMo wallet.
          </p>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm} loading={loading}>Delete</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
