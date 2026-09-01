import { z } from 'zod'

const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount')
  .optional()

// One row per real balance-sheet account the owner can state a starting
// figure for — Owner's Equity is deliberately excluded here: it's always
// computed as the balancing plug (assets minus liabilities) rather than
// entered directly, so the entry can never be submitted unbalanced.
export const OpeningBalanceInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  cash:               moneyString,
  bank:               moneyString,
  loansReceivable:    moneyString,
  accountsReceivable: moneyString,
  inventory:          moneyString,
  vatReceivable:      moneyString,
  accountsPayable:    moneyString,
  vatPayable:         moneyString,
  loansPayable:       moneyString,
})

export type OpeningBalanceInput = z.infer<typeof OpeningBalanceInputSchema>

// One line = one account plus either a debit or a credit amount (never
// both, never neither) — the same per-line convention postJournalEntry
// itself expects.
const accountLineSchema = z
  .object({
    accountId: z.string().uuid(),
    debit: moneyString,
    credit: moneyString,
  })
  .refine((l) => {
    const d = Number(l.debit ?? 0)
    const c = Number(l.credit ?? 0)
    return (d > 0) !== (c > 0)
  }, 'Each line must have either a debit or a credit, not both or neither')

// Server-side balance check is defense-in-depth — postJournalEntry already
// throws on any imbalance regardless — but catching it here gives the form
// a field-level error instead of a raw 500.
export const ManualJournalEntryInputSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    description: z.string().min(3, 'Description is required'),
    lines: z.array(accountLineSchema).min(2, 'At least two lines are required'),
  })
  .refine((v) => {
    const totalDebit = v.lines.reduce((sum, l) => sum + Number(l.debit ?? 0), 0)
    const totalCredit = v.lines.reduce((sum, l) => sum + Number(l.credit ?? 0), 0)
    return Math.abs(totalDebit - totalCredit) < 0.01
  }, { message: 'Total debits must equal total credits', path: ['lines'] })

export type ManualJournalEntryInput = z.infer<typeof ManualJournalEntryInputSchema>
