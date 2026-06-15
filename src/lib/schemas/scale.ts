import { z } from 'zod'

export const LineInputSchema = z.object({
  productId:   z.string().uuid(),
  weight:      z.string().regex(/^\d+(\.\d{1,3})?$/, 'Weight must be a positive number with up to 3 decimal places'),
  photoR2Keys: z.array(z.string().min(1)).min(1, 'At least one photo is required').max(5),
})

// Flexible line schema for step-configurable orders (weight/photos can be optional)
export const FlexibleLineInputSchema = z.object({
  productId:   z.string().uuid(),
  weight:      z.string().regex(/^\d+(\.\d{1,3})?$/).nullable().optional(),
  photoR2Keys: z.array(z.string().min(1)).max(5).optional().default([]),
})

export const CreateScaleOrderSchema = z.object({
  customerId:      z.string().uuid().optional(),
  casualFirstName: z.string().min(1).optional(),
  casualLastName:  z.string().min(1).optional(),
  casualPhone:     z.string().min(7).optional(),
  casualIdNumber:  z.string().optional(),
  casualAddress:   z.string().optional(),
  lines:           z.array(FlexibleLineInputSchema).min(1).max(20),
  notes:           z.string().max(500).optional(),
}).refine(
  d => d.customerId || (d.casualFirstName && d.casualLastName && d.casualPhone),
  { message: 'Either customerId or casual customer details (firstName, lastName, phone) are required' },
)

export const VoidScaleOrderSchema = z.object({
  voidReason: z.string().min(3, 'Void reason must be at least 3 characters'),
})

// ─── Step Config Schemas ──────────────────────────────────────────────────────

export const UpdateStepConfigSchema = z.object({
  requireWeight: z.boolean(),
  requirePhotos: z.boolean(),
})

export interface StepConfigResponse {
  categoryId:    string
  categoryName:  string
  parentId:      string | null
  requireWeight: boolean
  requirePhotos: boolean
  isInherited:   boolean
  updatedAt:     string | null
}

export type LineInput              = z.infer<typeof LineInputSchema>
export type FlexibleLineInput      = z.infer<typeof FlexibleLineInputSchema>
export type CreateScaleOrderInput  = z.infer<typeof CreateScaleOrderSchema>
export type VoidScaleOrderInput    = z.infer<typeof VoidScaleOrderSchema>
export type UpdateStepConfigInput  = z.infer<typeof UpdateStepConfigSchema>
