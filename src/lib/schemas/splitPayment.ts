import { z } from 'zod'
import Decimal from 'decimal.js'

const optionalDecimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount')
  .optional()
  .default('0')

export const SplitPaymentSchema = z.object({
  cash: optionalDecimalString,
  eft:  optionalDecimalString,
  loan: optionalDecimalString,
}).refine((data) => {
  const total = new Decimal(data.cash || '0')
    .plus(data.eft || '0')
    .plus(data.loan || '0')
  return total.greaterThan(0)
}, { message: 'At least one payment amount is required' })

export const ProcessSplitPaymentSchema = z.object({
  payments: SplitPaymentSchema,
}).refine((data) => {
  const total = new Decimal(data.payments.cash || '0')
    .plus(data.payments.eft || '0')
    .plus(data.payments.loan || '0')
  return total.greaterThan(0)
}, { message: 'At least one payment amount is required' })

export type SplitPaymentInput = z.infer<typeof SplitPaymentSchema>
export type ProcessSplitPaymentInput = z.infer<typeof ProcessSplitPaymentSchema>

// Sale-side split payment — same shape as the purchase one above, but the
// third leg nets against a BusinessLoan (money the business owes the buyer)
// rather than a Loan (money the business is owed), so it gets its own
// distinct field name to avoid conflating the two directions.
export const SaleSplitPaymentSchema = z.object({
  cash:         optionalDecimalString,
  eft:          optionalDecimalString,
  businessLoan: optionalDecimalString,
}).refine((data) => {
  const total = new Decimal(data.cash || '0')
    .plus(data.eft || '0')
    .plus(data.businessLoan || '0')
  return total.greaterThan(0)
}, { message: 'At least one payment amount is required' })

export const ProcessSaleSplitPaymentSchema = z.object({
  payments: SaleSplitPaymentSchema,
})

export type SaleSplitPaymentInput = z.infer<typeof SaleSplitPaymentSchema>
export type ProcessSaleSplitPaymentInput = z.infer<typeof ProcessSaleSplitPaymentSchema>
