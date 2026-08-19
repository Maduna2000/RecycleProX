'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Field, inp, Btn } from '@/components/rpx'
import { formatMoney } from '../_lib/money'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}

const ASSET_FIELDS = [
  { key: 'cash', label: 'Cash on Hand', hint: 'Physical cash in the drawer/till right now' },
  { key: 'bank', label: 'Bank', hint: 'Balance on the business bank account' },
  { key: 'loansReceivable', label: 'Loans Receivable', hint: 'Money owed back to the yard by customers' },
  { key: 'accountsReceivable', label: 'Accounts Receivable', hint: 'Sales made but not yet paid for' },
  { key: 'inventory', label: 'Inventory', hint: 'Value of stock currently on hand' },
  { key: 'vatReceivable', label: 'VAT Receivable', hint: 'VAT paid on purchases, reclaimable' },
] as const

const LIABILITY_FIELDS = [
  { key: 'accountsPayable', label: 'Accounts Payable', hint: 'Purchases made but not yet paid for' },
  { key: 'vatPayable', label: 'VAT Payable', hint: 'VAT collected on sales, owed to the tax authority' },
  { key: 'loansPayable', label: 'Loans Payable', hint: 'Money the business owes back to a dealer/lender' },
] as const

type FieldKey = (typeof ASSET_FIELDS)[number]['key'] | (typeof LIABILITY_FIELDS)[number]['key']

function n(v: string): number {
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function OpeningBalancePage() {
  const { data: status, isLoading: statusLoading, mutate } = useSWR<{ posted: boolean }>('/api/ledger/opening-balance', fetcher)
  const [date, setDate] = useState(todayLabel())
  const [values, setValues] = useState<Record<FieldKey, string>>({
    cash: '', bank: '', loansReceivable: '', accountsReceivable: '', inventory: '', vatReceivable: '',
    accountsPayable: '', vatPayable: '', loansPayable: '',
  })
  const [submitting, setSubmitting] = useState(false)

  function set(key: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  const totalAssets = ASSET_FIELDS.reduce((sum, f) => sum + n(values[f.key]), 0)
  const totalLiabilities = LIABILITY_FIELDS.reduce((sum, f) => sum + n(values[f.key]), 0)
  const equity = totalAssets - totalLiabilities
  const hasAnyValue = totalAssets > 0 || totalLiabilities > 0

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/ledger/opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ...values }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      toast.success('Opening balance posted — the ledger now starts from these figures.')
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post opening balance')
    } finally {
      setSubmitting(false)
    }
  }

  if (statusLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
  }

  if (status?.posted) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Opening Balances</h1>
          <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>
            An opening balance has already been posted for this business.
          </p>
        </div>
        <div style={{ background: colors.actionBg, border: `1px solid ${colors.action}`, borderRadius: 6, padding: '14px 16px', color: colors.action, fontSize: fontSize.base }}>
          The ledger already has a starting position on record — this is a one-time entry and can&apos;t be posted again.
          To correct it, post a dated adjusting journal entry instead (see the General Ledger / Chart of Accounts).
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 720 }}>
      <div>
        <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Opening Balances</h1>
        <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>
          One-time starting figures for the business as of the day it began using this ledger — the same idea as entering
          an opening balance for a new bank account. Owner&apos;s Equity isn&apos;t entered directly; it&apos;s calculated
          automatically as Assets minus Liabilities, so the entry always balances.
        </p>
      </div>

      <Field label="As of date" width={200}>
        <input type="date" value={date} max={todayLabel()} onChange={(e) => setDate(e.target.value)} style={inp} />
      </Field>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.border}`, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>
          Assets
        </div>
        <div className="flex flex-col gap-3" style={{ padding: 16 }}>
          {ASSET_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <div>
                <div style={{ fontSize: fontSize.base, color: colors.textPrimary }}>{f.label}</div>
                <div style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{f.hint}</div>
              </div>
              <input
                type="text" inputMode="decimal" placeholder="0.00"
                value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}
                style={{ ...inp, width: 140, textAlign: 'right', fontFamily: 'monospace' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.border}`, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>
          Liabilities
        </div>
        <div className="flex flex-col gap-3" style={{ padding: 16 }}>
          {LIABILITY_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <div>
                <div style={{ fontSize: fontSize.base, color: colors.textPrimary }}>{f.label}</div>
                <div style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{f.hint}</div>
              </div>
              <input
                type="text" inputMode="decimal" placeholder="0.00"
                value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}
                style={{ ...inp, width: 140, textAlign: 'right', fontFamily: 'monospace' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: 16 }}>
        <div className="flex justify-between" style={{ fontSize: fontSize.base, marginBottom: 4 }}>
          <span style={{ color: colors.textSecondary }}>Total Assets</span>
          <span style={{ fontFamily: 'monospace', fontWeight: fontWeight.semibold }}>{formatMoney(totalAssets.toFixed(2))}</span>
        </div>
        <div className="flex justify-between" style={{ fontSize: fontSize.base, marginBottom: 4 }}>
          <span style={{ color: colors.textSecondary }}>Total Liabilities</span>
          <span style={{ fontFamily: 'monospace', fontWeight: fontWeight.semibold }}>{formatMoney(totalLiabilities.toFixed(2))}</span>
        </div>
        <div className="flex justify-between" style={{ fontSize: fontSize.md, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
          <span style={{ fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Owner&apos;s Equity (calculated)</span>
          <span style={{ fontFamily: 'monospace', fontWeight: fontWeight.bold, color: equity >= 0 ? colors.action : colors.danger }}>
            {formatMoney(equity.toFixed(2))}
          </span>
        </div>
      </div>

      <div>
        <Btn variant="primary" loading={submitting} disabled={!hasAnyValue} onClick={handleSubmit}>
          Post Opening Balance
        </Btn>
      </div>
    </div>
  )
}
