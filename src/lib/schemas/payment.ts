import { z } from 'zod'

export const CreatePaymentSchema = z.object({
  customerId: z.string().uuid('Invalid customer'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount (e.g. 150.00)')
    .refine((v) => parseFloat(v) > 0, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['cash', 'eft', 'cheque']).default('cash'),
  notes: z.string().max(500).optional(),
})

export const VoidPaymentSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters'),
})

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>
export type CreatePaymentFormInput = z.input<typeof CreatePaymentSchema>
export type VoidPaymentInput = z.infer<typeof VoidPaymentSchema>
