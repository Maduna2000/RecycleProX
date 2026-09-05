import { z } from 'zod'

// SA banknote/coin denominations in cents (to avoid float keys). Includes 1c
// so any odd-cents total (e.g. from a digital/EFT-funded transaction mixed
// into the drawer) can still be counted exactly as a whole number of coins,
// without needing decimal input anywhere in the count fields.
export const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 1] as const
export type Denomination = (typeof DENOMINATIONS)[number]

// Human-readable labels
export const DENOMINATION_LABELS: Record<Denomination, string> = {
  20000: 'R200',
  10000: 'R100',
  5000:  'R50',
  2000:  'R20',
  1000:  'R10',
  500:   'R5',
  200:   'R2',
  100:   'R1',
  50:    '50c',
  1:     '1c',
}

// Denomination map: { "20000": 3, "10000": 5, ... }
const denominationsSchema = z.record(
  z.string().regex(/^\d+$/),
  z.number().int().min(0)
).optional()

export const SubmitCashUpSchema = z.object({
  denominations: denominationsSchema,
  declaredCash:  z.number().min(0, 'Declared cash must be non-negative'),
  notes:         z.string().max(500).optional(),
  // Admin-only escape hatch when expected cash doesn't match the day's
  // uploaded MoMo statement closing balance — see submitCashUp's
  // MomoBalanceMismatchError. Ignored (and re-blocked) for any other role.
  momoOverrideReason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500).optional(),
})

export const ApproveCashUpSchema = z.object({
  notes: z.string().max(500).optional(),
})

// Currency is no longer chosen per cash-up session — it's a single
// tenant-wide setting (see src/lib/constants/currencies.ts and
// SystemSettings key "currency"), applied automatically when a session
// opens. See openCashUp in cashUpService.ts.
//
// sessionDate is optional and, if sent, ignored by the route (see
// src/app/api/cashup/route.ts) — kept only so an old queued offline mutation
// with this field still in its body still validates. The server always
// computes "today" itself at the moment the session is actually created;
// trusting a client-supplied date broke when a request sat in the offline
// sync queue (src/lib/offline/sync.ts) across midnight and replayed hours
// later still carrying the date string captured back when it was queued.
export const OpenCashUpSchema = z.object({
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
})

export type SubmitCashUpInput  = z.infer<typeof SubmitCashUpSchema>
export type ApproveCashUpInput = z.infer<typeof ApproveCashUpSchema>
export type OpenCashUpInput    = z.infer<typeof OpenCashUpSchema>

// ─── Report Types ─────────────────────────────────────────────────────────────
export const CASHUP_REPORT_TYPES = [
  'cash-sales',
  'cash-purchases',
  'account-payments',
  'expenses',
  'loan-advances',
  'loan-repayments',
  'unpaid-today',
  'unpaid-all',
  'card-sales',
  'transferred-purchases',
  'drawings-received',
] as const

export type CashupReportType = (typeof CASHUP_REPORT_TYPES)[number]

export const CashupReportTypeSchema = z.enum(CASHUP_REPORT_TYPES)

export const CASHUP_REPORT_LABELS: Record<CashupReportType, string> = {
  'cash-sales':            'Cash Sales',
  'cash-purchases':        'Cash Purchases',
  'account-payments':      'Account Payments',
  'expenses':              'Expenses',
  'loan-advances':         'Loan Advances',
  'loan-repayments':       'Loan Repayments',
  'unpaid-today':          'Unpaid Purchases (Today)',
  'unpaid-all':            'Unpaid Purchases',
  'card-sales':            'Card Sales',
  'transferred-purchases': 'Transferred Purchases',
  'drawings-received':     'Drawings Received',
}

export const CashupReportQuerySchema = z.object({
  type: CashupReportTypeSchema,
})
