import { z } from 'zod'

export const CreateTradeCommodityCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  sortOrder: z.number().int().optional().default(0),
})

export const UpdateTradeCommodityCategorySchema = CreateTradeCommodityCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const ReorderTradeCommodityCategoriesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
})

export type CreateTradeCommodityCategoryInput = z.infer<typeof CreateTradeCommodityCategorySchema>
export type CreateTradeCommodityCategoryFormInput = z.input<typeof CreateTradeCommodityCategorySchema>
export type UpdateTradeCommodityCategoryInput = z.infer<typeof UpdateTradeCommodityCategorySchema>
export type ReorderTradeCommodityCategoriesInput = z.infer<typeof ReorderTradeCommodityCategoriesSchema>

export type TradeCommodityCategoryItem = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
