'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { ArrowLeft, Ban, Loader2, Plus, Printer, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'
import Decimal from 'decimal.js'
import { PhotoViewer } from '@/components/PhotoUploader'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Windows aesthetic styles
const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 8px', height: 28,
  fontSize: 10, fontWeight: 700, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
  background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)',
}
const TD: React.CSSProperties = { padding: '8px', fontSize: 12, color: colors.textPrimary }

const secBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary, cursor: 'pointer',
}
const priBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.action, border: `1px solid ${colors.actionHover}`, color: colors.textOnDark, cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.surface, border: `1px solid ${colors.danger}`, color: colors.danger, cursor: 'pointer',
}

type SaleLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  grossQty?: string
  tareQty?: string
  product: { id: string; code: string; name: string; unit: string }
}

type Sale = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  vatAmount?: string
  amountPaid?: string
  paymentMethod: string
  buyerName: string
  buyerIdNumber?: string
  buyerPhone?: string
  notes?: string
  voidedAt?: string
  voidReason?: string
  photoR2Keys?: string[]
  createdAt: string
  lines: SaleLine[]
}

function StatusBadge({ status }: { status: Sale['status'] }) {
  const styles: Record<Sale['status'], React.CSSProperties> = {
    completed: { background: colors.actionBg, color: colors.action, border: `1px solid ${colors.action}` },
    pending: { background: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}` },
    voided: { background: colors.dangerBg, color: colors.danger, border: `1px solid ${colors.danger}` },
  }
  const labels: Record<Sale['status'], string> = { completed: 'Completed', pending: 'Pending', voided: 'Voided' }
  return (
    <span style={{ ...styles[status], padding: '2px 6px', borderRadius: 2, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
      {labels[status]}
    </span>
  )
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const [voidOpen, setVoidOpen] = useState(false)

  const { data: sale, isLoading } = useSWR<Sale>(`/api/sales/${id}`, fetcher)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary }}>
        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }
  if (!sale) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary, fontSize: 13 }}>
        Sale not found
      </div>
    )
  }

  const outstanding = sale.status === 'pending'
    ? new Decimal(sale.totalAmount).minus(new Decimal(sale.amountPaid ?? '0'))
    : new Decimal(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 8 }}>
      {/* Main container with Windows border */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar with gradient */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <button onClick={() => router.push('/app/sales')} style={{ ...secBtn, padding: '0 6px' }}>
            <ArrowLeft style={{ width: 12, height: 12 }} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary, fontFamily: 'monospace' }}>{sale.refNumber}</span>
          <StatusBadge status={sale.status} />
          <span style={{ fontSize: 10, color: colors.textSecondary, padding: '2px 6px', background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 2, textTransform: 'capitalize' }}>
            {sale.paymentMethod}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => router.push('/app/sales/new')} style={priBtn}>
            <Plus style={{ width: 11, height: 11 }} /> New Sale
          </button>
        </div>

        {/* Voided banner */}
        {sale.status === 'voided' && (
          <div style={{ padding: '8px 12px', background: colors.dangerBg, borderBottom: `1px solid ${colors.danger}`, flexShrink: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: colors.danger }}>This sale has been voided</p>
            {sale.voidReason && <p style={{ fontSize: 11, color: colors.danger, marginTop: 2 }}>Reason: {sale.voidReason}</p>}
            {sale.voidedAt && <p style={{ fontSize: 10, color: colors.danger, opacity: 0.7, marginTop: 2 }}>{format.datetime(sale.voidedAt)}</p>}
          </div>
        )}

        {/* Pending banner */}
        {sale.status === 'pending' && (
          <div style={{ padding: '8px 12px', background: colors.warningBg, borderBottom: `1px solid ${colors.warning}`, flexShrink: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: colors.warning }}>Payment outstanding</p>
            <p style={{ fontSize: 11, color: colors.warning, marginTop: 2 }}>
              Balance due: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>R {outstanding.toFixed(2)}</span>
              {sale.amountPaid && new Decimal(sale.amountPaid).gt(0) && (
                <span style={{ marginLeft: 12, opacity: 0.8 }}>({`R ${new Decimal(sale.amountPaid).toFixed(2)} paid`})</span>
              )}
            </p>
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Sale info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Left: Sale details */}
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Sale Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
                <span style={{ color: colors.textSecondary }}>Reference:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: colors.textPrimary }}>{sale.refNumber}</span>
                <span style={{ color: colors.textSecondary }}>Date:</span>
                <span style={{ color: colors.textPrimary }}>{format.datetime(sale.createdAt)}</span>
                <span style={{ color: colors.textSecondary }}>Payment:</span>
                <span style={{ color: colors.textPrimary, textTransform: 'capitalize' }}>{sale.paymentMethod}</span>
              </div>
            </div>

            {/* Right: Buyer info */}
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Buyer</div>
              <div style={{ fontSize: 12 }}>
                <p style={{ fontWeight: 600, color: colors.textPrimary }}>{sale.buyerName}</p>
                {sale.buyerIdNumber && <p style={{ fontFamily: 'monospace', color: colors.textSecondary, marginTop: 2 }}>{sale.buyerIdNumber}</p>}
                {sale.buyerPhone && <p style={{ color: colors.textSecondary, marginTop: 2 }}>{sale.buyerPhone}</p>}
              </div>
            </div>
          </div>

          {/* Notes */}
          {sale.notes && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
              <p style={{ fontSize: 12, color: colors.textPrimary }}>{sale.notes}</p>
            </div>
          )}

          {/* Products table */}
          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>Products Sold</span>
              <span style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 8 }}>{sale.lines.length} items</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Product</th>
                  <th style={TH}>Qty</th>
                  <th style={TH}>Sell Price</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((line, i) => (
                  <tr key={line.id} style={{ borderBottom: i < sale.lines.length - 1 ? `1px solid ${colors.rowDivider}` : undefined }}>
                    <td style={TD}>
                      <p style={{ fontWeight: 500, color: colors.textPrimary }}>{line.product.name}</p>
                      <p style={{ fontSize: 10, fontFamily: 'monospace', color: colors.textSecondary }}>{line.product.code}</p>
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace' }}>
                      <div>{Number(line.quantity).toFixed(2)} {line.product.unit}</div>
                      {line.grossQty && line.tareQty && Number(line.tareQty) > 0 && (
                        <div style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                          Gross: {Number(line.grossQty).toFixed(2)} · Tare: {Number(line.tareQty).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace' }}>R {Number(line.unitPrice).toFixed(2)}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600, textAlign: 'right' }}>R {Number(line.lineTotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {sale.vatAmount && Number(sale.vatAmount) > 0 && (
                  <>
                    <tr style={{ background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)' }}>
                      <td colSpan={3} style={{ ...TD, textAlign: 'right', color: colors.textSecondary }}>Sub Total</td>
                      <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', color: colors.textPrimary }}>
                        R {(Number(sale.totalAmount) - Number(sale.vatAmount)).toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)' }}>
                      <td colSpan={3} style={{ ...TD, textAlign: 'right', color: colors.textSecondary }}>VAT</td>
                      <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', color: colors.textSecondary }}>
                        R {Number(sale.vatAmount).toFixed(2)}
                      </td>
                    </tr>
                  </>
                )}
                <tr style={{ borderTop: `2px solid ${colors.border}`, background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)' }}>
                  <td colSpan={3} style={{ ...TD, textAlign: 'right', fontWeight: 600, color: colors.textSecondary }}>Total</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, fontSize: 14, textAlign: 'right', color: colors.action }}>
                    R {Number(sale.totalAmount).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Photos */}
          {sale.photoR2Keys && sale.photoR2Keys.length > 0 && (
            <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)' }}>
                <Camera style={{ width: 12, height: 12, color: colors.action }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>Photos</span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sale.photoR2Keys.map((key) => (
                  <PhotoViewer
                    key={key}
                    r2Key={key}
                    alt="Sale photo"
                    canDelete={isManager}
                    onDelete={async () => {
                      const res = await fetch(`/api/sales/${sale.id}/photos`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ remove: key }),
                      })
                      if (res.ok) mutate(`/api/sales/${id}`)
                      else toast.error('Failed to remove photo')
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #B0B0B0', background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => window.open(`/api/sales/${sale.id}/receipt?format=pdf`, '_blank')}
              style={secBtn}
            >
              <Printer style={{ width: 11, height: 11 }} /> Print Receipt
            </button>
          </div>
          {isManager && sale.status !== 'voided' && (
            <button onClick={() => setVoidOpen(true)} style={dangerBtn}>
              <Ban style={{ width: 11, height: 11 }} /> Void Sale
            </button>
          )}
        </div>
      </div>

      {voidOpen && (
        <VoidModal
          sale={sale}
          onClose={() => setVoidOpen(false)}
          onSuccess={() => { mutate(`/api/sales/${id}`); setVoidOpen(false) }}
        />
      )}
    </div>
  )
}

function VoidModal({ sale, onClose, onSuccess }: { sale: Sale; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/sales/${sale.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Sale voided'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void sale') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <ModalTitleBar title="Void Sale" onClose={onClose} />
        <div style={{ padding: 12 }}>
          <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
            You are about to void <span style={{ fontWeight: 600, color: colors.textPrimary }}>{sale.refNumber}</span> (R {Number(sale.totalAmount).toFixed(2)}).
            This action cannot be undone.
          </p>
          <div style={{ marginBottom: 12 }}>
            <Label style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>Reason for void</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason (min 5 characters)"
              style={{ marginTop: 4, height: 28, fontSize: 12, borderColor: colors.border }}
              disabled={loading}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <ModalBtn variant="outline" onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            <ModalBtn variant="danger" onClick={onConfirm} disabled={loading || reason.trim().length < 5} loading={loading}>
              Confirm Void
            </ModalBtn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
