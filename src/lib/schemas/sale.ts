import { z } from 'zod'

const positiveQuantity = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,3})?$/, 'Must be a valid quantity (e.g. 12.500)')
  .refine((v) => parseFloat(v) > 0, 'Quantity must be greater than 0')

const positivePrice = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid price')
  .refine((v) => parseFloat(v) >= 0, 'Price cannot be negative')

export const SaleLineSchema = z.object({
  productId: z.string().uuid('Invalid product'),
  quantity: positiveQuantity,
  unitPrice: positivePrice,
})

export const CreateSaleSchema = z.object({
  // Buyer info — walk-in buyer, not necessarily a registered customer
  buyerId: z.string().uuid().optional(),
  buyerName: z.string().min(1, 'Buyer name is required').max(100),
  buyerIdNumber: z
    .string()
    .regex(/^\d{13}$/, 'ID number must be 13 digits')
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  buyerPhone: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  paymentMethod: z.enum(['cash', 'eft', 'cheque']).default('cash'),
  notes: z.string().max(500).optional(),
  lines: z.array(SaleLineSchema).min(1, 'At least one product line is required'),
})

export const VoidSaleSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters'),
})

export type SaleLineInput = z.infer<typeof SaleLineSchema>
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>
export type CreateSaleFormInput = z.input<typeof CreateSaleSchema>
export type VoidSaleInput = z.infer<typeof VoidSaleSchema>
