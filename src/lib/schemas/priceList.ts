import { z } from 'zod'

export const PriceListItemSchema = z.object({
  productId:   z.string().uuid().nullable().optional(),
  displayName: z.string().min(1, 'Name is required').max(80),
  priceIncVat: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : parseFloat(String(v))),
    z.number().positive('Price must be positive'),
  ),
  sortOrder:   z.coerce.number().int().min(0).default(0),
})

export const CreatePriceListSchema = z.object({
  title:      z.string().min(1, 'Title is required').max(80),
  listDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
  footerText: z.string().max(500).default(''),
  showLogo:   z.boolean().default(true),
  showExVat:  z.boolean().default(true),
  items:      z.array(PriceListItemSchema).min(1, 'Add at least one product').max(200),
})

export const UpdatePriceListSchema = CreatePriceListSchema.extend({
  updatedAt: z.string().datetime(), // optimistic locking — pass priceList.updatedAt from when the editor loaded
})

export const SetPriceListLogoSchema = z.object({
  r2Key: z.string().min(1).max(512),
})

export type PriceListItemInput   = z.infer<typeof PriceListItemSchema>
export type CreatePriceListInput = z.infer<typeof CreatePriceListSchema>
export type UpdatePriceListInput = z.infer<typeof UpdatePriceListSchema>
