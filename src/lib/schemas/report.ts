import { z } from 'zod'

const dateLabel = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

const MAX_RANGE_DAYS = 366

/** Adds from/to with the shared range checks (to ≥ from, span ≤ 366 days). */
function rangeParams<T extends z.ZodRawShape>(shape: T) {
  return z.object({ from: dateLabel, to: dateLabel, ...shape }).superRefine((raw: unknown, ctx) => {
    const p = raw as { from: string; to: string }
    if (p.to < p.from) {
      ctx.addIssue({ code: 'custom', message: '"to" must be on or after "from"', path: ['to'] })
      return
    }
    const from = new Date(`${p.from}T00:00:00Z`).getTime()
    const to = new Date(`${p.to}T00:00:00Z`).getTime()
    if ((to - from) / 86_400_000 > MAX_RANGE_DAYS) {
      ctx.addIssue({ code: 'custom', message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`, path: ['to'] })
    }
  })
}

export const ReportFormatSchema = z.enum(['json', 'pdf', 'xlsx']).default('json')

export const DealerCategorySchema = z.enum(['casual', 'dealer_1', 'dealer_2', 'dealer_3'])

export const BaseReportParamsSchema = rangeParams({})

// ── Purchases ─────────────────────────────────────────────────────────────────
export const PurchasesByProductCategoryParamsSchema = rangeParams({
  dealerCategory: DealerCategorySchema.optional(),
})

export const PurchasesDailyParamsSchema = rangeParams({
  customerId: z.string().uuid().optional(),
})

export const PurchasesSupplierStatementParamsSchema = rangeParams({
  customerId: z.string().uuid({ message: 'Supplier is required' }),
})

export const PurchasesPerProductDayParamsSchema = rangeParams({
  productId: z.string().uuid().optional(),
})

/** Flat per-product list (no category grouping) of everything actually purchased in the period, with a quantity-weighted average price. */
export const PurchasesAverageCostParamsSchema = rangeParams({
  productId: z.string().uuid().optional(),
})

export const PurchasesSplitPaymentsParamsSchema = rangeParams({
  customerId: z.string().uuid().optional(),
})

/** Search a casual/account seller by partial ID number and/or a transaction by partial ref number. */
export const PurchasesByIdSearchParamsSchema = rangeParams({
  idNumber: z.string().trim().max(20).optional(),
  refNumber: z.string().trim().max(40).optional(),
  customerId: z.string().uuid().optional(),
}).superRefine((raw: unknown, ctx) => {
  const p = raw as { idNumber?: string; refNumber?: string; customerId?: string }
  if (!p.idNumber && !p.refNumber && !p.customerId) {
    ctx.addIssue({ code: 'custom', message: 'Provide an ID number, transaction number, or customer', path: ['idNumber'] })
  }
})

/** Top 10 sellers by category (Ferrous / Non-Ferrous), scoped to casual or account sellers. */
export const TopSellersParamsSchema = rangeParams({
  customerType: z.enum(['casual', 'account']),
})

// ── Sales ─────────────────────────────────────────────────────────────────────
export const SalesDailyParamsSchema = rangeParams({
  customerId: z.string().uuid().optional(),
})

export const SalesByProductParamsSchema = rangeParams({})

export const SalesByCustomerParamsSchema = rangeParams({
  customerId: z.string().uuid().optional(),
})

export const SalesSplitPaymentsParamsSchema = rangeParams({
  customerId: z.string().uuid().optional(),
})

// ── Cash & Financial ──────────────────────────────────────────────────────────
export const ExpensesReportParamsSchema = rangeParams({
  status: z.enum(['approved', 'pending', 'all']).optional(),
})

/** Snapshot of loans still owing as at the "to" date ("from" is not used). */
export const LoansOutstandingParamsSchema = rangeParams({
  customerId: z.string().uuid().optional(),
})

export const LoanPaymentsParamsSchema = rangeParams({
  customerId: z.string().uuid().optional(),
})

/** Snapshot of a single cash-up session exactly as it stood at cash-up — from/to are unused (accepted for viewer symmetry). */
export const CashupSnapshotParamsSchema = rangeParams({
  cashupId: z.string().uuid({ message: 'Cash-up session is required' }),
})

// ── Stock ─────────────────────────────────────────────────────────────────────
export const StockOnHandParamsSchema = rangeParams({
  valuation: z.enum(['buy', 'sell']).optional(),
})

export const StockMovementParamsSchema = rangeParams({
  mode: z.enum(['summary', 'detail']).optional(),
  productId: z.string().uuid().optional(),
})

export const StocktakeReportParamsSchema = rangeParams({
  status: z.enum(['open', 'completed', 'all']).optional(),
})

// ── Police & Compliance ────────────────────────────────────────────────────────
/** Copper purchases, optionally narrowed to a seller by partial ID number. */
export const PoliceCopperReportParamsSchema = rangeParams({
  idNumber: z.string().trim().max(20).optional(),
})

export type BaseReportParams = z.infer<typeof BaseReportParamsSchema>
export type ReportFormat = z.infer<typeof ReportFormatSchema>
export type PurchasesByProductCategoryParams = z.infer<typeof PurchasesByProductCategoryParamsSchema>
export type PurchasesDailyParams = z.infer<typeof PurchasesDailyParamsSchema>
export type PurchasesSupplierStatementParams = z.infer<typeof PurchasesSupplierStatementParamsSchema>
export type PurchasesPerProductDayParams = z.infer<typeof PurchasesPerProductDayParamsSchema>
export type PurchasesAverageCostParams = z.infer<typeof PurchasesAverageCostParamsSchema>
export type PurchasesSplitPaymentsParams = z.infer<typeof PurchasesSplitPaymentsParamsSchema>
export type PurchasesByIdSearchParams = z.infer<typeof PurchasesByIdSearchParamsSchema>
export type SalesDailyParams = z.infer<typeof SalesDailyParamsSchema>
export type SalesByProductParams = z.infer<typeof SalesByProductParamsSchema>
export type SalesByCustomerParams = z.infer<typeof SalesByCustomerParamsSchema>
export type SalesSplitPaymentsParams = z.infer<typeof SalesSplitPaymentsParamsSchema>
export type ExpensesReportParams = z.infer<typeof ExpensesReportParamsSchema>
export type LoansOutstandingParams = z.infer<typeof LoansOutstandingParamsSchema>
export type LoanPaymentsParams = z.infer<typeof LoanPaymentsParamsSchema>
export type CashupSnapshotParams = z.infer<typeof CashupSnapshotParamsSchema>
export type StockOnHandParams = z.infer<typeof StockOnHandParamsSchema>
export type StockMovementParams = z.infer<typeof StockMovementParamsSchema>
export type StocktakeReportParams = z.infer<typeof StocktakeReportParamsSchema>
export type PoliceCopperReportParams = z.infer<typeof PoliceCopperReportParamsSchema>
export type TopSellersParams = z.infer<typeof TopSellersParamsSchema>
