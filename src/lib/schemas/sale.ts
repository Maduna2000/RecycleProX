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

const optionalDecimal = z.string().regex(/^\d+(\.\d{1,3})?$/).optional()

export const SaleLineSchema = z.object({
  productId:       z.string().uuid('Invalid product'),
  quantity:        positiveQuantity,
  unitPrice:       positivePrice,
  grossQty:        optionalDecimal,
  tareQty:         optionalDecimal,
  tareReason:      z.string().optional(),
  deductionQty:    optionalDecimal,
  deductionReason: z.string().optional(),
}).superRefine((line, ctx) => {
  if (line.deductionQty && parseFloat(line.deductionQty) > 0 && !line.deductionReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Deduction reason is required when a deduction amount is set',
      path: ['deductionReason'],
    })
  }
})

export const CreateSaleSchema = z.object({
  customerId: z.string().uuid().optional(),
  buyerId:    z.string().uuid().optional(),
  buyerName:  z.string().min(1, 'Buyer name is required').max(100),
  buyerIdNumber: z
    .string()
    .min(5, 'National ID number is too short')
    .max(20, 'National ID number is too long')
    .regex(/^[A-Za-z0-9\-\/]+$/, 'National ID may only contain letters, digits, hyphens, or slashes')
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  buyerPhone:    z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  paymentMethod: z.enum(['cash', 'eft']).default('cash'),
  status:        z.enum(['pending', 'completed']).default('completed'),
  notes:         z.string().max(500).optional(),
  // VAT is opt-in: the cashier ticks "Apply VAT" (auto-filled client-side from
  // an account customer's VAT setting) — never applied by default.
  applyVat:      z.boolean().default(false),
  businessLoanDeductionAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount').optional(),
  lines:         z.array(SaleLineSchema).min(1, 'At least one product line is required'),
})

export const VoidSaleSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters'),
})

export const ReverseSalePaymentSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
})

// Hand-declared rather than CreateSaleSchema.partial() — a partial() still
// silently re-applies the create schema's .default() to any field the caller
// omits. An edit always resubmits the full current state of the form (not a
// sparse patch), so every field below is required as-is. businessLoanDeductionAmount
// is left out on purpose: createSale only ever applies that deduction when
// the sale settles immediately (status !== 'pending'), and an edit always
// leaves the sale pending — there's nothing to (re)apply here.
export const UpdateSaleSchema = z.object({
  customerId: z.string().uuid().optional(),
  buyerId:    z.string().uuid().optional(),
  buyerName:  z.string().min(1, 'Buyer name is required').max(100),
  buyerIdNumber: z
    .string()
    .min(5, 'National ID number is too short')
    .max(20, 'National ID number is too long')
    .regex(/^[A-Za-z0-9\-\/]+$/, 'National ID may only contain letters, digits, hyphens, or slashes')
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  buyerPhone:    z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  paymentMethod: z.enum(['cash', 'eft']).default('cash'),
  notes:         z.string().max(500).optional(),
  applyVat:      z.boolean().default(false),
  lines:         z.array(SaleLineSchema).min(1, 'At least one product line is required'),
})

export type SaleLineInput    = z.infer<typeof SaleLineSchema>
export type CreateSaleInput  = z.infer<typeof CreateSaleSchema>
export type CreateSaleFormInput = z.input<typeof CreateSaleSchema>
export type VoidSaleInput    = z.infer<typeof VoidSaleSchema>
export type ReverseSalePaymentInput = z.infer<typeof ReverseSalePaymentSchema>
export type UpdateSaleInput = z.infer<typeof UpdateSaleSchema>
