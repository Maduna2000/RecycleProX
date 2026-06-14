import { z } from 'zod'

export const LineInputSchema = z.object({
  productId:   z.string().uuid(),
  weight:      z.string().regex(/^\d+(\.\d{1,3})?$/, 'Weight must be a positive number with up to 3 decimal places'),
  photoR2Keys: z.array(z.string().min(1)).min(1, 'At least one photo is required').max(5),
})

export const CreateScaleOrderSchema = z.object({
  customerId:      z.string().uuid().optional(),
  casualFirstName: z.string().min(1).optional(),
  casualLastName:  z.string().min(1).optional(),
  casualPhone:     z.string().min(7).optional(),
  casualIdNumber:  z.string().optional(),
  casualAddress:   z.string().optional(),
  lines:           z.array(LineInputSchema).min(1).max(20),
  notes:           z.string().max(500).optional(),
}).refine(
  d => d.customerId || (d.casualFirstName && d.casualLastName && d.casualPhone),
  { message: 'Either customerId or casual customer details (firstName, lastName, phone) are required' },
)

export const VoidScaleOrderSchema = z.object({
  voidReason: z.string().min(3, 'Void reason must be at least 3 characters'),
})

export type LineInput              = z.infer<typeof LineInputSchema>
export type CreateScaleOrderInput    = z.infer<typeof CreateScaleOrderSchema>
export type VoidScaleOrderInput      = z.infer<typeof VoidScaleOrderSchema>
