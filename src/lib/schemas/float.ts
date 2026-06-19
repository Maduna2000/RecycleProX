import { z } from 'zod'

export const SetFloatSchema = z.object({
  floatDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  openingAmount: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : parseFloat(String(v))),
    z.number().min(0, 'Amount cannot be negative'),
  ),
  notes: z.string().optional(),
})

export type SetFloatInput     = z.infer<typeof SetFloatSchema>
export type SetFloatFormInput = z.input<typeof SetFloatSchema>

export const ReverseFloatSchema = z.object({
  reason: z.string().max(500).optional(),
})

export type ReverseFloatInput = z.infer<typeof ReverseFloatSchema>
