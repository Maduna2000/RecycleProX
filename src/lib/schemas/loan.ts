import { z } from 'zod'

const positiveDecimalString = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount (e.g. 500.00)')
  .refine((v) => parseFloat(v) > 0, 'Amount must be greater than 0')

export const CreateLoanSchema = z.object({
  customerId:      z.string().uuid('Invalid customer'),
  principalAmount: positiveDecimalString,
  paymentMethod:   z.enum(['cash', 'eft']).default('cash'),
  notes:           z.string().max(500).optional(),
})

export const CreateRepaymentSchema = z.object({
  loanId:        z.string().uuid('Invalid loan'),
  amount:        positiveDecimalString,
  paymentMethod: z.enum(['cash', 'eft']).default('cash'),
  notes:         z.string().max(500).optional(),
})

export const VoidLoanSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters').max(500),
})

// Customer-level repayment (no loanId) — applied FIFO across the customer's
// active loans, same oldest-first order applyRepaymentTx already uses for
// purchase deductions. Used by the Loans-tab ledger's "Add Repayment"
// button, which — like the legacy tool it mirrors — doesn't ask which loan.
export const CreateManualRepaymentSchema = z.object({
  amount:        positiveDecimalString,
  paymentMethod: z.enum(['cash', 'eft']).default('cash'),
  notes:         z.string().max(500).optional(),
})

export const ReverseRepaymentSchema = z.object({
  reason: z.string().min(5, 'Reversal reason must be at least 5 characters').max(500),
})

// "YYYY-MM" — the ledger ties statement periods
const finPeriodString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be a valid period (YYYY-MM)')

export const LoanStatementQuerySchema = z.object({
  period: finPeriodString.optional(),
})

export type CreateLoanInput             = z.infer<typeof CreateLoanSchema>
export type CreateRepaymentInput        = z.infer<typeof CreateRepaymentSchema>
export type VoidLoanInput               = z.infer<typeof VoidLoanSchema>
export type CreateManualRepaymentInput  = z.infer<typeof CreateManualRepaymentSchema>
export type ReverseRepaymentInput       = z.infer<typeof ReverseRepaymentSchema>
export type LoanStatementQueryInput     = z.infer<typeof LoanStatementQuerySchema>
