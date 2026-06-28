import { z } from 'zod'

// SA banknote/coin denominations in cents (to avoid float keys)
export const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50] as const
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
})

export const ApproveCashUpSchema = z.object({
  notes: z.string().max(500).optional(),
})

// Currency options
export const CURRENCIES = ['ZAR', 'SZL'] as const
export type Currency = (typeof CURRENCIES)[number]

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ZAR: 'R',   // South African Rand
  SZL: 'E',   // Eswatini Lilangeni
}

export const CURRENCY_LABELS: Record<Currency, string> = {
  ZAR: 'South African Rand (R)',
  SZL: 'Eswatini Lilangeni (E)',
}

export const OpenCashUpSchema = z.object({
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  currency: z.enum(CURRENCIES).optional().default('ZAR'),
})

export type SubmitCashUpInput  = z.infer<typeof SubmitCashUpSchema>
export type ApproveCashUpInput = z.infer<typeof ApproveCashUpSchema>
export type OpenCashUpInput    = z.infer<typeof OpenCashUpSchema>
