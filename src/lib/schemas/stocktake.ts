import { z } from 'zod'

// Quantity validation for stocktake entries (4 decimal places to match DB precision)
const nonNegativeQty = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a valid quantity (up to 4 decimal places)')
  .refine((v) => parseFloat(v) >= 0, 'Quantity cannot be negative')

const optionalNonNegativeQty = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a valid quantity (up to 4 decimal places)')
  .refine((v) => parseFloat(v) >= 0, 'Quantity cannot be negative')
  .optional()

// ─── Create Stocktake ─────────────────────────────────────────────────────────

export const CreateStocktakeSchema = z.object({
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
})

export type CreateStocktakeInput = z.infer<typeof CreateStocktakeSchema>

// ─── Upsert Entry ─────────────────────────────────────────────────────────────

export const UpsertEntrySchema = z.object({
  productId:  z.string().uuid('Invalid product ID'),
  countedQty: nonNegativeQty,
  grossQty:   optionalNonNegativeQty,
  tareQty:    optionalNonNegativeQty,
  photoR2Key: z.string().max(500, 'Photo R2 key too long').optional(),
  // Off by default = compare against the stocktake's frozen opening snapshot
  // (existing behavior). On = compare against live stock-on-hand right now,
  // so anything that arrived after the stocktake opened (e.g. a purchase
  // delivered mid-count) isn't added a second time by the completion
  // adjustment on top of what the counted figure already includes.
  includeTodayStock: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  // If both gross and tare are provided, gross must be >= tare
  if (data.grossQty && data.tareQty) {
    const gross = parseFloat(data.grossQty)
    const tare = parseFloat(data.tareQty)
    if (gross < tare) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gross weight cannot be less than tare weight',
        path: ['grossQty'],
      })
    }
  }
})

export type UpsertEntryInput = z.infer<typeof UpsertEntrySchema>

// ─── Update Entry Photo ───────────────────────────────────────────────────────

export const UpdateEntryPhotoSchema = z.object({
  productId:  z.string().uuid('Invalid product ID'),
  photoR2Key: z.string().min(1, 'Photo R2 key is required').max(500, 'Photo R2 key too long'),
})

export type UpdateEntryPhotoInput = z.infer<typeof UpdateEntryPhotoSchema>

// ─── Void Stocktake ───────────────────────────────────────────────────────────

export const VoidStocktakeSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters').max(500, 'Reason too long'),
})

export type VoidStocktakeInput = z.infer<typeof VoidStocktakeSchema>
