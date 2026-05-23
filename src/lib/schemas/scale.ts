import { z } from 'zod'

export const CreateScaleCategorySchema = z.object({
  name:        z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  colorHex:    z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  iconName:    z.string().max(60).optional(),
  sortOrder:   z.number().int().min(0).default(0),
})

export const UpdateScaleCategorySchema = CreateScaleCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const CreateScaleProductSchema = z.object({
  categoryId: z.string().uuid(),
  name:       z.string().min(1).max(120),
  unit:       z.enum(['kg', 'ton', 'each', 'litre']).default('kg'),
  sortOrder:  z.number().int().min(0).default(0),
})

export const UpdateScaleProductSchema = CreateScaleProductSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const CreateScaleOrderSchema = z.object({
  customerId:  z.string().uuid(),
  productId:   z.string().uuid(),
  weight:      z.string().regex(/^\d+(\.\d{1,3})?$/, 'Weight must be a positive number with up to 3 decimal places'),
  photoR2Keys: z.array(z.string().min(1)).min(1, 'At least one photo is required').max(5),
  notes:       z.string().max(500).optional(),
})

export const VoidScaleOrderSchema = z.object({
  voidReason: z.string().min(3, 'Void reason must be at least 3 characters'),
})

export type CreateScaleCategoryInput = z.infer<typeof CreateScaleCategorySchema>
export type UpdateScaleCategoryInput = z.infer<typeof UpdateScaleCategorySchema>
export type CreateScaleProductInput  = z.infer<typeof CreateScaleProductSchema>
export type UpdateScaleProductInput  = z.infer<typeof UpdateScaleProductSchema>
export type CreateScaleOrderInput    = z.infer<typeof CreateScaleOrderSchema>
export type VoidScaleOrderInput      = z.infer<typeof VoidScaleOrderSchema>
