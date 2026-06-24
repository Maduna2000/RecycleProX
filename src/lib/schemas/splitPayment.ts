import { z } from 'zod'
import Decimal from 'decimal.js'

const optionalDecimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount')
  .optional()
  .default('0')

export const SplitPaymentSchema = z.object({
  cash:   optionalDecimalString,
  eft:    optionalDecimalString,
  cheque: optionalDecimalString,
  loan:   optionalDecimalString,
}).refine((data) => {
  const total = new Decimal(data.cash || '0')
    .plus(data.eft || '0')
    .plus(data.cheque || '0')
    .plus(data.loan || '0')
  return total.greaterThan(0)
}, { message: 'At least one payment amount is required' })

export const ProcessSplitPaymentSchema = z.object({
  payments: SplitPaymentSchema,
}).refine((data) => {
  const total = new Decimal(data.payments.cash || '0')
    .plus(data.payments.eft || '0')
    .plus(data.payments.cheque || '0')
    .plus(data.payments.loan || '0')
  return total.greaterThan(0)
}, { message: 'At least one payment amount is required' })

export type SplitPaymentInput = z.infer<typeof SplitPaymentSchema>
export type ProcessSplitPaymentInput = z.infer<typeof ProcessSplitPaymentSchema>
