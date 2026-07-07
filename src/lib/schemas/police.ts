/**
 * Police Register module schemas — officer visit sessions and register searches.
 * Shared between the officer portal frontend and the API routes.
 */
import { z } from 'zod'

export const POLICE_VISIT_REASONS = [
  'routine_inspection',
  'stolen_goods_investigation',
  'person_enquiry',
  'other',
] as const

export const VISIT_REASON_LABELS: Record<(typeof POLICE_VISIT_REASONS)[number], string> = {
  routine_inspection:         'Routine inspection',
  stolen_goods_investigation: 'Stolen goods investigation',
  person_enquiry:             'Person enquiry',
  other:                      'Other',
}

/** Officer registers a new inspection session at the portal. */
export const BeginInspectionSchema = z.object({
  officerName:   z.string().trim().min(2, 'Officer name is required').max(120),
  rank:          z.string().trim().min(2, 'Rank is required').max(80),
  badgeNumber:   z.string().trim().min(2, 'Service number is required').max(50),
  stationName:   z.string().trim().min(2, 'Police station is required').max(120),
  contactNumber: z.string().trim().max(30).optional().or(z.literal('').transform(() => undefined)),
  visitReason:   z.enum(POLICE_VISIT_REASONS),
  visitNote:     z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
})
export type BeginInspectionInput = z.infer<typeof BeginInspectionSchema>

/** End an inspection: sign (with signature key) or manager force-end. */
export const EndInspectionSchema = z.object({
  action:         z.enum(['sign', 'force_end']),
  signatureR2Key: z.string().max(500).optional(),
}).refine((d) => d.action !== 'sign' || !!d.signatureR2Key, {
  message: 'signatureR2Key is required when signing',
  path: ['signatureR2Key'],
})
export type EndInspectionInput = z.infer<typeof EndInspectionSchema>

const dateYMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD required)')

/** Register-by-date search. */
export const RegisterSearchSchema = z.object({
  visitId: z.string().uuid(),
  from:    dateYMD,
  to:      dateYMD,
}).refine((d) => d.from <= d.to, { message: 'from must be on or before to', path: ['to'] })
export type RegisterSearchInput = z.infer<typeof RegisterSearchSchema>

/** Person search by name or ID number. */
export const PersonSearchSchema = z.object({
  visitId: z.string().uuid(),
  q:       z.string().trim().min(2, 'Enter at least 2 characters').max(120),
})
export type PersonSearchInput = z.infer<typeof PersonSearchSchema>

/** Goods search by product across a date range. */
export const GoodsSearchSchema = z.object({
  visitId:     z.string().uuid(),
  productId:   z.string().uuid(),
  from:        dateYMD.optional(),
  to:          dateYMD.optional(),
  minQuantity: z.coerce.number().positive().optional(),
}).refine((d) => !d.from || !d.to || d.from <= d.to, { message: 'from must be on or before to', path: ['to'] })
export type GoodsSearchInput = z.infer<typeof GoodsSearchSchema>
