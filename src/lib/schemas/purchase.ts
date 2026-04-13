import { z } from 'zod'

const positiveQuantity = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,3})?$/, 'Must be a valid quantity (e.g. 12.500)')
  .refine((v) => parseFloat(v) > 0, 'Quantity must be greater than 0')

const optionalQty = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Must be a valid quantity')
  .optional()

export const PurchaseLineSchema = z.object({
  productId: z.string().uuid('Invalid product'),
  quantity: positiveQuantity,
  grossQty: optionalQty,
  tareQty:  optionalQty,
  tareReason: z.string().max(100).optional(),
  unitPrice: z
    .string()
    .min(1, 'Required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid price')
    .refine((v) => parseFloat(v) >= 0, 'Price cannot be negative'),
})

export const CreatePurchaseSchema = z.object({
  customerId:          z.string().uuid('Invalid customer'),
  paymentMethod:       z.enum(['cash', 'eft', 'cheque', 'amplopay']).default('cash'),
  status:              z.enum(['completed', 'pending']).default('completed'),
  notes:               z.string().max(500).optional(),
  loanDeductionAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount').optional(),
  lines:               z.array(PurchaseLineSchema).min(1, 'At least one product line is required'),
})

export const VoidPurchaseSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters'),
})

export type PurchaseLineInput = z.infer<typeof PurchaseLineSchema>
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>
export type CreatePurchaseFormInput = z.input<typeof CreatePurchaseSchema>
export type VoidPurchaseInput = z.infer<typeof VoidPurchaseSchema>
