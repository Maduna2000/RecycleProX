import { z } from 'zod'

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Print palette — defaults match the original fixed navy/gold scheme. */
export const PriceListColorsSchema = z.object({
  primaryColor:      z.string().regex(HEX_RE, 'Must be a hex color').default('#1B3A6B'),
  accentColor:       z.string().regex(HEX_RE, 'Must be a hex color').default('#C9A227'),
  headerTextColor:   z.string().regex(HEX_RE, 'Must be a hex color').default('#FFFFFF'),
  materialTextColor: z.string().regex(HEX_RE, 'Must be a hex color').default('#121212'),
  priceTextColor:    z.string().regex(HEX_RE, 'Must be a hex color').default('#1B3A6B'),
  exVatTextColor:    z.string().regex(HEX_RE, 'Must be a hex color').default('#737373'),
  rowTintColor:      z.string().regex(HEX_RE, 'Must be a hex color').default('#E6EBF5'),
})

export const DEFAULT_PRICE_LIST_COLORS = PriceListColorsSchema.parse({})

export const PriceListItemSchema = z.object({
  productId:   z.string().uuid().nullable().optional(),
  displayName: z.string().min(1, 'Name is required').max(80),
  category:    z.string().max(40).default('Other'),
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
  colors:     PriceListColorsSchema.default(DEFAULT_PRICE_LIST_COLORS),
  items:      z.array(PriceListItemSchema).min(1, 'Add at least one product').max(200),
})

export const UpdatePriceListSchema = CreatePriceListSchema.extend({
  updatedAt: z.string().datetime(), // optimistic locking — pass priceList.updatedAt from when the editor loaded
})

// Same shape as create — a preview is a throwaway PDF render of unsaved
// draft state, never persisted, so it needs no optimistic-lock field.
export const PreviewPriceListSchema = CreatePriceListSchema

export const SetPriceListLogoSchema = z.object({
  r2Key: z.string().min(1).max(512),
})

export type PriceListColors      = z.infer<typeof PriceListColorsSchema>
export type PriceListItemInput   = z.infer<typeof PriceListItemSchema>
export type CreatePriceListInput = z.infer<typeof CreatePriceListSchema>
export type UpdatePriceListInput = z.infer<typeof UpdatePriceListSchema>
