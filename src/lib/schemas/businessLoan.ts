import { z } from 'zod'
import Decimal from 'decimal.js'

const positiveDecimalString = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount (e.g. 500.00)')
  .refine((v) => parseFloat(v) > 0, 'Amount must be greater than 0')

const optionalDecimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount')
  .optional()
  .default('0')

export const CreateBusinessLoanSchema = z.object({
  customerId:      z.string().uuid('Invalid customer'),
  principalAmount: positiveDecimalString,
  paymentMethod:   z.enum(['cash', 'eft']).default('cash'),
  notes:           z.string().max(500).optional(),
})

// Manual "Record Payment" action on the Business Loan tab — pays down one
// specific loan directly (as opposed to applyBusinessLoanRepaymentTx, which
// nets a sale's proceeds against a customer's loans FIFO). Split across
// cash/EFT in one action, mirroring the Purchases split-payment modal.
export const RecordBusinessLoanRepaymentSchema = z.object({
  payments: z.object({
    cash: optionalDecimalString,
    eft:  optionalDecimalString,
  }),
  notes: z.string().max(500).optional(),
}).refine((data) => {
  const total = new Decimal(data.payments.cash || '0').plus(data.payments.eft || '0')
  return total.greaterThan(0)
}, { message: 'At least one payment amount is required' })

export const VoidBusinessLoanSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters').max(500),
})

export const VerifyBusinessLoanPinSchema = z.object({
  customerId: z.string().uuid('Invalid customer'),
  pin:        z.string().regex(/^\d{4}$/, 'PIN must be 4 digits'),
})

const finPeriodString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be a valid period (YYYY-MM)')

export const BusinessLoanStatementQuerySchema = z.object({
  period: finPeriodString.optional(),
})

export const ReverseBusinessLoanRepaymentSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500),
})

export type CreateBusinessLoanInput             = z.infer<typeof CreateBusinessLoanSchema>
export type VoidBusinessLoanInput               = z.infer<typeof VoidBusinessLoanSchema>
export type VerifyBusinessLoanPinInput          = z.infer<typeof VerifyBusinessLoanPinSchema>
export type RecordBusinessLoanRepaymentInput    = z.infer<typeof RecordBusinessLoanRepaymentSchema>
export type BusinessLoanStatementQueryInput     = z.infer<typeof BusinessLoanStatementQuerySchema>
export type ReverseBusinessLoanRepaymentInput   = z.infer<typeof ReverseBusinessLoanRepaymentSchema>
