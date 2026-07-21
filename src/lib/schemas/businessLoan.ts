import { z } from 'zod'

const positiveDecimalString = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount (e.g. 500.00)')
  .refine((v) => parseFloat(v) > 0, 'Amount must be greater than 0')

export const CreateBusinessLoanSchema = z.object({
  customerId:      z.string().uuid('Invalid customer'),
  principalAmount: positiveDecimalString,
  paymentMethod:   z.enum(['cash', 'eft']).default('cash'),
  notes:           z.string().max(500).optional(),
})

export const CreateBusinessLoanRepaymentSchema = z.object({
  businessLoanId: z.string().uuid('Invalid loan'),
  amount:         positiveDecimalString,
  paymentMethod:  z.enum(['cash', 'eft']).default('cash'),
  notes:          z.string().max(500).optional(),
})

export const VoidBusinessLoanSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters').max(500),
})

export const VerifyBusinessLoanPinSchema = z.object({
  customerId: z.string().uuid('Invalid customer'),
  pin:        z.string().regex(/^\d{4}$/, 'PIN must be 4 digits'),
})

export type CreateBusinessLoanInput           = z.infer<typeof CreateBusinessLoanSchema>
export type CreateBusinessLoanRepaymentInput  = z.infer<typeof CreateBusinessLoanRepaymentSchema>
export type VoidBusinessLoanInput             = z.infer<typeof VoidBusinessLoanSchema>
export type VerifyBusinessLoanPinInput        = z.infer<typeof VerifyBusinessLoanPinSchema>
