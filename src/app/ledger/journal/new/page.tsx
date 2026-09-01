'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Field, inp, Btn } from '@/components/rpx'
import { formatMoney } from '../../_lib/money'
import type { AccountTreeNode } from '@/lib/services/ledgerReportService'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}

interface LineRow {
  key: number
  accountId: string
  debit: string
  credit: string
}

function emptyLine(key: number): LineRow {
  return { key, accountId: '', debit: '', credit: '' }
}

function flatten(nodes: AccountTreeNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'  '.repeat(depth)}${n.code} — ${n.name}` },
    ...flatten(n.children, depth + 1),
  ])
}

function n(v: string): number {
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function NewJournalEntryPage() {
  const router = useRouter()
  const { data: accountsData } = useSWR<{ accounts: AccountTreeNode[] }>('/api/ledger/accounts', fetcher)
  const accountOptions = flatten(accountsData?.accounts ?? [])

  const [date, setDate] = useState(todayLabel())
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<LineRow[]>([emptyLine(1), emptyLine(2)])
  const [keyCounter, setKeyCounter] = useState(3)
  const [submitting, setSubmitting] = useState(false)

  function patchLine(key: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine(keyCounter)])
    setKeyCounter((k) => k + 1)
  }
  function removeLine(key: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)))
  }

  const totalDebit = lines.reduce((sum, l) => sum + n(l.debit), 0)
  const totalCredit = lines.reduce((sum, l) => sum + n(l.credit), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0
  const linesComplete = lines.every((l) => l.accountId && (n(l.debit) > 0 || n(l.credit) > 0) && !(n(l.debit) > 0 && n(l.credit) > 0))
  const canSubmit = description.trim().length >= 3 && linesComplete && balanced

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/ledger/journal/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          description,
          lines: lines.map((l) => ({
            accountId: l.accountId,
            debit: n(l.debit) > 0 ? l.debit : undefined,
            credit: n(l.credit) > 0 ? l.credit : undefined,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      toast.success('Journal entry posted.')
      router.push('/ledger/journal?sourceType=manual_adjustment')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post journal entry')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 820 }}>
      <div>
        <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>New Journal Entry</h1>
        <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>
          A free-form manual/adjusting entry (accruals, bank fees, depreciation, write-offs, corrections) that doesn&apos;t
          come from a normal purchase, sale, or expense. Each line must have either a debit or a credit — never both — and
          the whole entry must balance before it can be posted.
        </p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <Field label="Date" width={200}>
          <input type="date" value={date} max={todayLabel()} onChange={(e) => setDate(e.target.value)} style={inp} />
        </Field>
        <Field label="Description" width={420}>
          <input
            type="text" placeholder="What is this entry for?"
            value={description} onChange={(e) => setDescription(e.target.value)}
            style={{ ...inp, width: '100%' }}
          />
        </Field>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.border}`, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>
          Lines
        </div>
        <div className="flex flex-col gap-2" style={{ padding: 16 }}>
          {lines.map((line) => (
            <div key={line.key} className="flex items-center gap-2">
              <select
                value={line.accountId}
                onChange={(e) => patchLine(line.key, { accountId: e.target.value })}
                style={{ ...inp, flex: 1 }}
              >
                <option value="">Select account…</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id} style={{ whiteSpace: 'pre' }}>{a.label}</option>
                ))}
              </select>
              <input
                type="text" inputMode="decimal" placeholder="Debit"
                value={line.debit}
                onChange={(e) => patchLine(line.key, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
                style={{ ...inp, width: 110, textAlign: 'right', fontFamily: 'monospace' }}
              />
              <input
                type="text" inputMode="decimal" placeholder="Credit"
                value={line.credit}
                onChange={(e) => patchLine(line.key, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
                style={{ ...inp, width: 110, textAlign: 'right', fontFamily: 'monospace' }}
              />
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                disabled={lines.length <= 2}
                style={{
                  background: 'none', border: 'none', cursor: lines.length <= 2 ? 'not-allowed' : 'pointer',
                  color: lines.length <= 2 ? colors.textSecondary : colors.danger, padding: 4, opacity: lines.length <= 2 ? 0.4 : 1,
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div>
            <button
              type="button" onClick={addLine}
              className="flex items-center gap-1"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.link, fontSize: fontSize.sm, padding: '6px 0' }}
            >
              <Plus size={14} /> Add Line
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderRadius: 6, background: colors.bg, border: `1px solid ${colors.border}` }}>
        <div className="flex gap-6">
          <div>
            <span style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Total Debit </span>
            <span style={{ fontFamily: 'monospace', fontWeight: fontWeight.semibold }}>{formatMoney(totalDebit.toFixed(2))}</span>
          </div>
          <div>
            <span style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Total Credit </span>
            <span style={{ fontFamily: 'monospace', fontWeight: fontWeight.semibold }}>{formatMoney(totalCredit.toFixed(2))}</span>
          </div>
        </div>
        <div
          className="flex items-center gap-2"
          style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: balanced ? colors.action : colors.danger }}
        >
          {balanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {balanced ? 'Balanced' : 'Not balanced — debits must equal credits'}
        </div>
      </div>

      <div>
        <Btn variant="primary" loading={submitting} disabled={!canSubmit} onClick={handleSubmit}>
          Post Journal Entry
        </Btn>
      </div>
    </div>
  )
}
