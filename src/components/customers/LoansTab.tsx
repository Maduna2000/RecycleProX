'use client'

import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Plus, Minus, Trash2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'
import { HEADER_GRAD, NAVY, lbl, Btn, winBevel, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { fetcher } from '@/lib/swrFetcher'

// ─── Types ──────────────────────────────────────────────────────────────────

type LedgerRow = {
  id:          string
  date:        string
  description: string
  transaction: string
  advance:     string | null
  repayment:   string | null
  balance:     string
}

type LastEntry = {
  kind:        'loan' | 'repayment'
  id:          string
  description: string
  amount:      string
  date:        string
} | null

type StatementResponse = {
  period:         string
  openingBalance: string
  closingBalance: string
  rows:           LedgerRow[]
  lastEntry:      LastEntry
}

interface LoansTabProps {
  customerId:         string
  customerName:       string
  userRole:           string
  userAllowedModules: string[]
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT' },
]

// Tighter than the shared Btn "sm" size — this toolbar sits directly above a
// narrow, capped-width table, so its buttons should read as compact controls
// rather than full-size actions.
const COMPACT_BTN: React.CSSProperties = { fontSize: 10.5, padding: '3px 9px', gap: 4 }

const LEDGER_PAGE_SIZE = 30

function SHdr({ title }: { title: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{title}</span>
    </div>
  )
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Legacy sign convention this tab replicates: negative = the customer owes
// the business money (matches the reference tool's "Amount Due: R -198.50").
const moneyColor = (v: string) => (new Decimal(v).isNegative() ? '#D97706' : colors.action)

// Display-only grouping for this tab's ledger: if a customer repays more
// than once on the same calendar day — even across separate transactions
// made hours apart — collapse those rows into one combined line instead of
// one row per transaction (e.g. a R500 stock-repayment and a later R400
// one both read as a single R900 repayment for the day). Doesn't touch the
// server-computed balances, doesn't merge advance/opening rows, and has no
// effect on the Reports module, which builds its own statement separately.
function aggregateSameDayRepayments(rows: LedgerRow[]): LedgerRow[] {
  const isRepaymentRow = (row: LedgerRow) => row.id !== 'opening' && row.advance == null && row.repayment != null
  const dayKey = (row: LedgerRow) => new Date(row.date).toDateString()

  const lastIndexByDay = new Map<string, number>()
  rows.forEach((row, i) => {
    if (isRepaymentRow(row)) lastIndexByDay.set(dayKey(row), i)
  })

  const result: LedgerRow[] = []
  rows.forEach((row, i) => {
    if (!isRepaymentRow(row)) {
      result.push(row)
      return
    }
    // Earlier same-day repayments are folded into the day's last row below.
    if (i !== lastIndexByDay.get(dayKey(row))) return

    const group = rows.filter((r) => isRepaymentRow(r) && dayKey(r) === dayKey(row))
    if (group.length === 1) {
      result.push(row)
      return
    }
    const totalRepayment = group.reduce((sum, r) => sum.plus(r.repayment ?? '0'), new Decimal(0))
    const transactions = Array.from(new Set(group.map((r) => r.transaction).filter(Boolean)))
    result.push({
      ...row,
      description: 'Loan Repayment',
      transaction: transactions.length === 1 ? transactions[0]! : 'Multiple',
      repayment: totalRepayment.toFixed(2),
    })
  })
  return result
}

const ledgerColumns: Column<LedgerRow>[] = [
  {
    key: 'description',
    header: 'Description',
    render: (row) => <span style={{ fontWeight: row.id === 'opening' ? 600 : 400 }}>{row.description}</span>,
  },
  {
    key: 'date',
    header: 'Loan Date',
    width: '95px',
    render: (row) => (
      <span style={{ color: '#6C757D' }}>
        {new Date(row.date).toLocaleDateString('en-ZA', { year: 'numeric', month: '2-digit', day: '2-digit' })}
      </span>
    ),
  },
  {
    key: 'transaction',
    header: 'Transaction',
    width: '100px',
    render: (row) => <span style={{ color: '#6C757D' }}>{row.transaction}</span>,
  },
  {
    key: 'advance',
    header: 'Advance',
    width: '95px',
    align: 'right',
    render: (row) => <span style={{ fontFamily: 'monospace' }}>{format.currency(row.advance ?? '0')}</span>,
  },
  {
    key: 'repayment',
    header: 'Repayment',
    width: '95px',
    align: 'right',
    render: (row) => <span style={{ fontFamily: 'monospace' }}>{format.currency(row.repayment ?? '0')}</span>,
  },
  {
    key: 'balance',
    header: 'Balance',
    width: '105px',
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: moneyColor(row.balance) }}>
        {format.currency(row.balance)}
      </span>
    ),
  },
]

// ─── LoansTab ─────────────────────────────────────────────────────────────────

export function LoansTab({ customerId, customerName, userRole, userAllowedModules }: LoansTabProps) {
  const [period,           setPeriod]           = useState(currentPeriod())
  const [addLoanOpen,      setAddLoanOpen]      = useState(false)
  const [addRepaymentOpen, setAddRepaymentOpen] = useState(false)
  const [deleteLastOpen,   setDeleteLastOpen]   = useState(false)
  const [ledgerPage,       setLedgerPage]       = useState(1)

  const statementKey = `/api/customers/${customerId}/loans/statement?period=${period}`
  const { data, isLoading, error } = useSWR<StatementResponse>(statementKey, fetcher)

  // Reset to page 1 whenever the Fin Period changes so switching months
  // never leaves the ledger stuck on a page that no longer has that many
  // rows in it.
  useEffect(() => { setLedgerPage(1) }, [period])

  const canManage =
    userRole === 'admin' ||
    userAllowedModules.length === 0 || // Empty = full access
    userAllowedModules.includes('/app/loans')

  function revalidate() {
    mutate(statementKey)
  }

  const closingBalance = data ? new Decimal(data.closingBalance) : new Decimal(0)
  const ledgerRows = aggregateSameDayRepayments(data?.rows ?? [])
  const ledgerPageRows = ledgerRows.slice((ledgerPage - 1) * LEDGER_PAGE_SIZE, ledgerPage * LEDGER_PAGE_SIZE)

  return (
    <div>
      <SHdr title="Loans" />

      {/* Toolbar — mirrors the legacy "Special Loans" window: actions on the
          left, period picker + print on the right. Fills the panel's full
          width (like the Transactions tab's table) instead of capping to
          the ledger's old narrower width, which left a dead gap between the
          table and the panel's actual edge now that the whole page is
          already capped. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '6px 10px',
          borderBottom: '1px solid #E0E0E0',
          background: '#FAFAFA',
          flexWrap: 'wrap',
        }}
      >
        {canManage && (
          <>
            <Btn size="sm" icon={Plus} style={COMPACT_BTN} onClick={() => setAddLoanOpen(true)}>Add Loan</Btn>
            <Btn size="sm" icon={Plus} style={COMPACT_BTN} onClick={() => setAddRepaymentOpen(true)}>Add Repayment</Btn>
            <Btn
              size="sm"
              icon={Trash2}
              variant="danger"
              style={COMPACT_BTN}
              disabled={!data?.lastEntry}
              onClick={() => setDeleteLastOpen(true)}
              title={data?.lastEntry ? 'Undo the most recent loan or repayment entry' : 'No loan activity to delete'}
            >
              Delete Last
            </Btn>
          </>
        )}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.textSecondary, fontWeight: 600 }}>
          Fin Period
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 3, background: '#fff', ...winBevel(true) }}
          />
        </label>
        <Btn
          size="sm"
          icon={Printer}
          style={COMPACT_BTN}
          onClick={() => window.open(`/api/customers/${customerId}/loans/statement/pdf?period=${period}`, '_blank')}
        >
          Print Statement
        </Btn>
      </div>

      {/* Ledger — fills the panel width, matching the Transactions tab. */}
      <div style={{ padding: 10 }}>
        <DataTable
          columns={ledgerColumns}
          rows={ledgerPageRows}
          rowKey={(row) => row.id}
          loading={isLoading}
          error={error instanceof Error ? error.message : !!error}
          emptyMessage="No loan activity for this period"
          total={ledgerRows.length}
          page={ledgerPage}
          pageSize={LEDGER_PAGE_SIZE}
          onPageChange={setLedgerPage}
        />
      </div>

      {/* Footer — Amount Due */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '8px 12px',
          borderTop: '1px solid #E0E0E0',
          background: '#FAFAFA',
        }}
      >
        <span style={lbl}>Amount Due</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: moneyColor(closingBalance.toString()) }}>
          {format.currency(closingBalance.toString())}
        </span>
      </div>

      {/* Add Loan Dialog */}
      {addLoanOpen && (
        <AddLoanDialog
          customerId={customerId}
          customerName={customerName}
          onClose={() => setAddLoanOpen(false)}
          onSuccess={() => { revalidate(); setAddLoanOpen(false) }}
        />
      )}

      {/* Add Repayment Dialog */}
      {addRepaymentOpen && (
        <AddRepaymentDialog
          customerId={customerId}
          customerName={customerName}
          onClose={() => setAddRepaymentOpen(false)}
          onSuccess={() => { revalidate(); setAddRepaymentOpen(false) }}
        />
      )}

      {/* Delete Last Dialog */}
      {deleteLastOpen && data?.lastEntry && (
        <DeleteLastDialog
          lastEntry={data.lastEntry}
          onClose={() => setDeleteLastOpen(false)}
          onSuccess={() => { revalidate(); setDeleteLastOpen(false) }}
        />
      )}
    </div>
  )
}

// ─── Add Loan Dialog ────────────────────────────────────────────────────────
function AddLoanDialog({
  customerId,
  customerName,
  onClose,
  onSuccess,
}: {
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (!amount) return
    setLoading(true)
    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        principalAmount: amount,
        paymentMethod: method,
        notes: notes || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Loan advanced')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string | { formErrors?: string[] } }
      const msg =
        typeof j.error === 'string'
          ? j.error
          : (j.error as { formErrors?: string[] })?.formErrors?.[0] ?? 'Failed to create loan'
      toast.error(msg)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title={`Add Loan for ${customerName}`} onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
          <div>
            <Label>Amount (R) *</Label>
            <Input
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              type="number"
              step="0.01"
              min="0"
            />
          </div>
          <div>
            <Label>Payment Method *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
              maxLength={500}
            />
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" onClick={onSubmit} disabled={!amount} loading={loading}>
            Add Loan
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Add Repayment Dialog ───────────────────────────────────────────────────
// Customer-level, not loan-level — applied FIFO across active loans server-
// side (createManualRepayment), matching the legacy tool's own "Add
// Repayment" button, which never asks which loan either.
function AddRepaymentDialog({
  customerId,
  customerName,
  onClose,
  onSuccess,
}: {
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (!amount) return
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/loans/repay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        paymentMethod: method,
        notes: notes || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Repayment recorded')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string | { formErrors?: string[] } }
      const msg =
        typeof j.error === 'string'
          ? j.error
          : (j.error as { formErrors?: string[] })?.formErrors?.[0] ?? 'Failed to record repayment'
      toast.error(msg)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title={`Add Repayment From ${customerName}`} onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Pays down the oldest outstanding loan first, then the next, until the amount is used up.
          </p>
          <div>
            <Label>Amount (R) *</Label>
            <Input
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              type="number"
              step="0.01"
              min="0"
            />
          </div>
          <div>
            <Label>Payment Method *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes <span className="font-normal text-gray-400">(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" maxLength={500} />
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" onClick={onSubmit} disabled={!amount} loading={loading}>
            Add Repayment
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Delete Last Dialog ─────────────────────────────────────────────────────
// Undoes whichever entry is actually last: void (loan advance, only legal
// when it has zero repayments — voidLoan's own existing rule) or reverse
// (repayment — writes an offsetting negative entry, never deletes).
function DeleteLastDialog({
  lastEntry,
  onClose,
  onSuccess,
}: {
  lastEntry: NonNullable<LastEntry>
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (reason.trim().length < 5) return
    setLoading(true)
    const url = lastEntry.kind === 'loan'
      ? `/api/loans/${lastEntry.id}/void`
      : `/api/loans/repayments/${lastEntry.id}/reverse`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(lastEntry.kind === 'loan' ? 'Loan advance deleted' : 'Repayment reversed')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string }
      toast.error(j.error ?? 'Failed to delete last entry')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Delete Last Entry" icon={Minus} onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
          <div className="rounded p-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <p className="font-medium" style={{ color: '#DC2626' }}>
              {lastEntry.description} of {format.currency(lastEntry.amount)} on{' '}
              {new Date(lastEntry.date).toLocaleDateString('en-ZA')}
            </p>
            <p className="text-xs mt-1" style={{ color: '#DC2626' }}>
              {lastEntry.kind === 'loan'
                ? 'This will delete the loan advance. Only possible while nothing has been repaid against it yet.'
                : 'This will reverse the repayment, restoring the loan balance it paid down. The original entry stays on record.'}
            </p>
          </div>
          <div>
            <Label>Reason *</Label>
            <Textarea
              placeholder="Enter a reason (min 5 characters)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1"
              maxLength={500}
            />
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={onSubmit} disabled={reason.trim().length < 5} loading={loading}>
            Delete Last
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
