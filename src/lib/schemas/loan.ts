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

export type CreateLoanInput      = z.infer<typeof CreateLoanSchema>
export type CreateRepaymentInput = z.infer<typeof CreateRepaymentSchema>
export type VoidLoanInput        = z.infer<typeof VoidLoanSchema>
