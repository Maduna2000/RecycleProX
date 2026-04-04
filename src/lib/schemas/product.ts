import { z } from 'zod'

const positiveDecimal = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid price (e.g. 12.50)')
  .refine((v) => parseFloat(v) >= 0, 'Price cannot be negative')

export const CreateProductSchema = z.object({
  code: z.string().min(1, 'Product code is required').max(20).toUpperCase(),
  name: z.string().min(1, 'Product name is required').max(100),
  category: z.enum(['ferrous', 'non_ferrous', 'copper', 'aluminium', 'plastic', 'paper', 'e_waste', 'other']),
  unit: z.enum(['kg', 'ton', 'each']).default('kg'),
  defaultBuyPrice: positiveDecimal,
  defaultSellPrice: positiveDecimal,
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export const UpdateProductSchema = CreateProductSchema.partial().omit({ code: true })

export const BulkPriceUpdateSchema = z.object({
  updates: z.array(z.object({
    productId: z.string().uuid(),
    defaultBuyPrice: positiveDecimal,
    defaultSellPrice: positiveDecimal,
    reason: z.string().optional(),
  })).min(1, 'At least one product must be updated'),
})

export const CreatePriceGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(255).optional(),
  isDefault: z.boolean().default(false),
})

export const UpdatePriceGroupSchema = CreatePriceGroupSchema.partial()

export const SetGroupOverridesSchema = z.object({
  overrides: z.array(z.object({
    productId: z.string().uuid(),
    buyPrice: positiveDecimal,
    sellPrice: positiveDecimal,
  })),
})

export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type CreateProductFormInput = z.input<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
export type BulkPriceUpdateInput = z.infer<typeof BulkPriceUpdateSchema>
export type CreatePriceGroupInput = z.infer<typeof CreatePriceGroupSchema>
export type CreatePriceGroupFormInput = z.input<typeof CreatePriceGroupSchema>
export type UpdatePriceGroupInput = z.infer<typeof UpdatePriceGroupSchema>
export type SetGroupOverridesInput = z.infer<typeof SetGroupOverridesSchema>
