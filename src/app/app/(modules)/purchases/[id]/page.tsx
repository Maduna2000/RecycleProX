'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Ban, Printer, Camera, FileText, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'
import { PhotoUploader, PhotoViewer } from '@/components/PhotoUploader'
import { colors } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import {
  inp, lbl, TH, TD, HEADER_GRAD, NAVY,
  Btn, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'


type PurchaseLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  priceSource: string
  grossQty?: string | null
  tareQty?: string | null
  deductionQty?: string | null
  deductionReason?: string | null
  product: { id: string; code: string; name: string; unit: string; category: string }
}

type Purchase = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  amountPaid: string
  loanDeductionAmount?: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  voidReason?: string
  createdAt: string
  updatedAt: string
  createdByUserId?: string
  signatureR2Key?: string
  photoR2Keys?: string[]
  customer: {
    id: string; firstName: string; lastName: string; idNumber: string; phone: string
  }
  lines: PurchaseLine[]
}

function StatusBadge({ status }: { status: Purchase['status'] }) {
  const styles: Record<Purchase['status'], React.CSSProperties> = {
    completed: { background: colors.actionBg, color: colors.action, border: `1px solid ${colors.action}` },
    pending: { background: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}` },
    voided: { background: colors.dangerBg, color: colors.danger, border: `1px solid ${colors.danger}` },
  }
  const labels: Record<Purchase['status'], string> = { completed: 'Completed', pending: 'Pending', voided: 'Voided' }
  return (
    <span style={{ ...styles[status], padding: '2px 6px', borderRadius: 2, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
      {labels[status]}
    </span>
  )
}

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const [voidOpen, setVoidOpen] = useState(false)

  const { data: purchase, isLoading, error } = useSWR<Purchase>(`/api/purchases/${id}`, fetcher)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

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
        {error instanceof Error ? error.message : 'Failed to load purchase'}
      </div>
    )
  }
  if (!purchase) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary, fontSize: 13 }}>
        Purchase not found
      </div>
    )
  }

  const hasLoanDeduction = purchase.loanDeductionAmount && Number(purchase.loanDeductionAmount) > 0
  const netPayout = hasLoanDeduction
    ? Number(purchase.totalAmount) - Number(purchase.loanDeductionAmount)
    : Number(purchase.totalAmount)

  return (
    <>
    <PortalPage title={purchase.refNumber}>
        {/* Sub-header: status + payment method */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <StatusBadge status={purchase.status} />
          <span style={{ fontSize: 10, color: colors.textSecondary, padding: '2px 6px', background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 2, textTransform: 'capitalize' }}>
            {purchase.paymentMethod}
          </span>
        </div>

        {/* Voided banner */}
        {purchase.status === 'voided' && (
          <div style={{ padding: '8px 12px', background: colors.dangerBg, borderBottom: `1px solid ${colors.danger}`, flexShrink: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: colors.danger }}>This purchase has been voided</p>
            {purchase.voidReason && <p style={{ fontSize: 11, color: colors.danger, marginTop: 2 }}>Reason: {purchase.voidReason}</p>}
            {purchase.voidedAt && <p style={{ fontSize: 10, color: colors.danger, opacity: 0.7, marginTop: 2 }}>{format.datetime(purchase.voidedAt)}</p>}
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Purchase info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Left: Purchase details */}
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Purchase Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
                <span style={{ color: colors.textSecondary }}>Reference:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: colors.textPrimary }}>{purchase.refNumber}</span>
                <span style={{ color: colors.textSecondary }}>Date:</span>
                <span style={{ color: colors.textPrimary }}>{format.datetime(purchase.createdAt)}</span>
                <span style={{ color: colors.textSecondary }}>Payment:</span>
                <span style={{ color: colors.textPrimary, textTransform: 'capitalize' }}>{purchase.paymentMethod}</span>
              </div>
            </div>

            {/* Right: Customer info */}
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Customer</div>
              <div style={{ fontSize: 12 }}>
                <p style={{ fontWeight: 600, color: colors.textPrimary }}>{purchase.customer.firstName} {purchase.customer.lastName}</p>
                <p style={{ fontFamily: 'monospace', color: colors.textSecondary, marginTop: 2 }}>{purchase.customer.idNumber}</p>
                <p style={{ color: colors.textSecondary, marginTop: 2 }}>{purchase.customer.phone}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {purchase.notes && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
              <p style={{ fontSize: 12, color: colors.textPrimary }}>{purchase.notes}</p>
            </div>
          )}

          {/* Products table */}
          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: HEADER_GRAD }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>Products Purchased</span>
              <span style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 8 }}>{purchase.lines.length} items</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Product</th>
                  <th style={TH}>Qty</th>
                  <th style={TH}>Unit Price</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {purchase.lines.map((line, i) => {
                  const hasWeightData = Number(line.grossQty ?? 0) > 0
                  const hasDeduction = Number(line.deductionQty ?? 0) > 0
                  return (
                    <tr key={line.id} style={{ borderBottom: i < purchase.lines.length - 1 ? `1px solid ${colors.rowDivider}` : undefined }}>
                      <td style={TD}>
                        <p style={{ fontWeight: 500, color: colors.textPrimary }}>{line.product.name}</p>
                        <p style={{ fontSize: 10, fontFamily: 'monospace', color: colors.textSecondary }}>{line.product.code}</p>
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace' }}>
                        <div>{Number(line.quantity).toFixed(2)} {line.product.unit}</div>
                        {hasWeightData && (
                          <div style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                            Gross {Number(line.grossQty).toFixed(2)}
                            {Number(line.tareQty ?? 0) > 0 && ` · Tare ${Number(line.tareQty).toFixed(2)}`}
                            {hasDeduction && ` · Ded. ${Number(line.deductionQty).toFixed(2)}`}
                            {hasDeduction && line.deductionReason && (
                              <span style={{ color: colors.warning }}> ({line.deductionReason})</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace' }}>R {Number(line.unitPrice).toFixed(2)}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600, textAlign: 'right' }}>R {Number(line.lineTotal).toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                {hasLoanDeduction ? (
                  <>
                    <tr style={{ borderTop: `1px solid ${colors.border}`, background: colors.surface }}>
                      <td colSpan={3} style={{ ...TD, textAlign: 'right', color: colors.textSecondary }}>Gross payout</td>
                      <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', color: colors.textSecondary }}>
                        R {Number(purchase.totalAmount).toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ background: colors.surface }}>
                      <td colSpan={3} style={{ ...TD, textAlign: 'right', fontWeight: 500, color: colors.warning }}>Loan deduction</td>
                      <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', fontWeight: 500, color: colors.warning }}>
                        − R {Number(purchase.loanDeductionAmount).toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ borderTop: `2px solid ${colors.border}`, background: HEADER_GRAD }}>
                      <td colSpan={3} style={{ ...TD, textAlign: 'right', fontWeight: 600, color: colors.textPrimary }}>Cash Paid Out</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, fontSize: 14, textAlign: 'right', color: colors.action }}>
                        R {netPayout.toFixed(2)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr style={{ borderTop: `2px solid ${colors.border}`, background: HEADER_GRAD }}>
                    <td colSpan={3} style={{ ...TD, textAlign: 'right', fontWeight: 600, color: colors.textSecondary }}>Total Payout</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, fontSize: 14, textAlign: 'right', color: colors.action }}>
                      R {Number(purchase.totalAmount).toFixed(2)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* Photos */}
          {purchase.status !== 'voided' && (
            <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: HEADER_GRAD }}>
                <Camera style={{ width: 12, height: 12, color: colors.action }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>Product Photos</span>
              </div>
              <div style={{ padding: 12 }}>
                <PurchasePhotos purchaseId={purchase.id} initialKeys={purchase.photoR2Keys ?? []} />
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #E0E0E0', background: '#F8F9FA', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" icon={Printer} onClick={() => window.open(`/api/purchases/${purchase.id}/receipt?format=pdf`, '_blank')}>
              Print Receipt
            </Btn>
            <Btn size="sm" icon={FileText} onClick={() => window.open(`/api/purchases/${purchase.id}/vat264`, '_blank')}>
              Download VAT264
            </Btn>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isManager && purchase.status === 'pending' && new Decimal(purchase.amountPaid).isZero() && (
              <Btn size="sm" icon={Pencil} onClick={() => router.push(`/app/purchases/${purchase.id}/edit`)}>
                Edit
              </Btn>
            )}
            {isManager && purchase.status !== 'voided' && (
              <Btn variant="danger" size="sm" icon={Ban} onClick={() => setVoidOpen(true)}>
                Void Purchase
              </Btn>
            )}
          </div>
        </div>
    </PortalPage>

      {voidOpen && (
        <VoidModal
          purchase={purchase}
          onClose={() => setVoidOpen(false)}
          onSuccess={() => {
            mutate(`/api/purchases/${id}`)
            setVoidOpen(false)
          }}
        />
      )}
    </>
  )
}

// ─── Purchase Photos ─────────────────────────────────────────────────────────
function PurchasePhotos({ purchaseId, initialKeys }: { purchaseId: string; initialKeys: string[] }) {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const [keys, setKeys] = useState<string[]>(initialKeys)

  async function handleUploaded(key: string) {
    await fetch(`/api/purchases/${purchaseId}/photos`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add: key }),
    })
    setKeys((prev) => [...prev, key])
  }

  async function handleDelete(key: string) {
    const [r2Res, dbRes] = await Promise.all([
      fetch('/api/r2/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }),
      fetch(`/api/purchases/${purchaseId}/photos`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remove: key }) }),
    ])
    if (r2Res.ok && dbRes.ok) {
      setKeys((prev) => prev.filter((k) => k !== key))
      toast.success('Photo deleted')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {keys.map((k) => (
        <PhotoViewer
          key={k}
          r2Key={k}
          alt="Purchase photo"
          canDelete={isManager}
          onDelete={() => handleDelete(k)}
        />
      ))}
      <PhotoUploader
        context="purchase_photo"
        referenceId={purchaseId}
        label="Add Product Photo"
        onUploaded={handleUploaded}
      />
    </div>
  )
}

// ─── Void Modal ───────────────────────────────────────────────────────────────
function VoidModal({ purchase, onClose, onSuccess }: { purchase: Purchase; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/purchases/${purchase.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Purchase voided'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void purchase') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Void Purchase" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 12px' }}>
            You are about to void <span style={{ fontWeight: 600, color: colors.textPrimary }}>{purchase.refNumber}</span> (R {Number(purchase.totalAmount).toFixed(2)}).
            This action cannot be undone.
          </p>
          <span style={lbl}>Reason for void</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason (min 5 characters)"
            style={inp}
            disabled={loading}
          />
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm} disabled={reason.trim().length < 5} loading={loading}>
            Confirm Void
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
