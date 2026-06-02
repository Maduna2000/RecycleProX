import { z } from 'zod'

const positiveDecimal = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid price (e.g. 12.50)')
  .refine((v) => parseFloat(v) >= 0, 'Price cannot be negative')

export const CreateProductSchema = z.object({
  code: z.string().min(1, 'Product code is required').max(20).toUpperCase(),
  name: z.string().min(1, 'Product name is required').max(100),
  category: z.string().min(1, 'Category is required'),
  unit: z.enum(['kg', 'ton', 'each', 'litre']).default('kg'),
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

export const CreateCategorySchema = z.object({
  name:      z.string().min(1, 'Name is required').max(80),
  colorHex:  z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional().or(z.literal('')),
  iconName:  z.string().max(50).optional().or(z.literal('')),
  sortOrder: z.number().int().default(0),
  parentId:  z.string().uuid().optional().nullable(),
})
export const UpdateCategorySchema = CreateCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
})
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>

export type SubCategoryItem = {
  id: string; name: string; colorHex: string | null; iconName: string | null
  sortOrder: number; isActive: boolean; parentId: string | null
  _count?: { products: number }
}
export type CategoryWithChildren = SubCategoryItem & { children: SubCategoryItem[] }

export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type CreateProductFormInput = z.input<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
export type BulkPriceUpdateInput = z.infer<typeof BulkPriceUpdateSchema>
export type CreatePriceGroupInput = z.infer<typeof CreatePriceGroupSchema>
export type CreatePriceGroupFormInput = z.input<typeof CreatePriceGroupSchema>
export type UpdatePriceGroupInput = z.infer<typeof UpdatePriceGroupSchema>
export type SetGroupOverridesInput = z.infer<typeof SetGroupOverridesSchema>
