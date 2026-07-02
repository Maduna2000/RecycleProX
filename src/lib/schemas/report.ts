import { z } from 'zod'

const dateLabel = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

const MAX_RANGE_DAYS = 366

/** Shared from/to range: to ≥ from, span capped at 366 days. */
export const BaseReportParamsSchema = z
  .object({
    from: dateLabel,
    to: dateLabel,
  })
  .refine((p) => p.to >= p.from, { message: '"to" must be on or after "from"', path: ['to'] })
  .refine(
    (p) => {
      const from = new Date(`${p.from}T00:00:00Z`).getTime()
      const to = new Date(`${p.to}T00:00:00Z`).getTime()
      return (to - from) / 86_400_000 <= MAX_RANGE_DAYS
    },
    { message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`, path: ['to'] }
  )

export const ReportFormatSchema = z.enum(['json', 'pdf', 'xlsx']).default('json')

export const DealerCategorySchema = z.enum(['casual', 'dealer_1', 'dealer_2', 'dealer_3'])

export const PurchasesByProductCategoryParamsSchema = z
  .object({
    from: dateLabel,
    to: dateLabel,
    dealerCategory: DealerCategorySchema.optional(),
  })
  .refine((p) => p.to >= p.from, { message: '"to" must be on or after "from"', path: ['to'] })
  .refine(
    (p) => (new Date(`${p.to}T00:00:00Z`).getTime() - new Date(`${p.from}T00:00:00Z`).getTime()) / 86_400_000 <= MAX_RANGE_DAYS,
    { message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`, path: ['to'] }
  )

export type BaseReportParams = z.infer<typeof BaseReportParamsSchema>
export type ReportFormat = z.infer<typeof ReportFormatSchema>
export type PurchasesByProductCategoryParams = z.infer<typeof PurchasesByProductCategoryParamsSchema>
