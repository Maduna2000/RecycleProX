import { z } from 'zod'

export const GateEntryPurposeSchema = z.enum(['sell', 'buy', 'visitor', 'other'])

// visitorIdNumber is the only customer-linkage input the server trusts —
// customerId is never accepted from the client, it's always re-derived
// server-side from an exact idNumber match (see gateService.ts). This means
// a client can't dodge the blacklist hard-block by simply omitting a
// customerId it knows would fail the check.
export const CreateGateEntrySchema = z.object({
  purpose:           GateEntryPurposeSchema,
  categoryNames:     z.array(z.string().min(1)).optional(),
  visitorFirstName:  z.string().min(1, 'First name is required'),
  visitorLastName:   z.string().min(1, 'Last name is required'),
  visitorIdNumber:   z.string().min(1, 'ID number is required'),
  visitorPhone:      z.string().optional(),
  vehicleReg:        z.string().optional(),
  idPhotoR2Key:      z.string().optional(),
  vehiclePhotoR2Key: z.string().optional(),
  facePhotoR2Key:    z.string().optional(),
  notes:             z.string().max(500).optional(),
}).refine(
  (d) => d.purpose !== 'sell' || (d.categoryNames && d.categoryNames.length > 0),
  { message: 'At least one category is required when entering to sell', path: ['categoryNames'] },
)

export const UpdateGatePurposeConfigSchema = z.object({
  requireIdPhoto:      z.boolean(),
  requireVehiclePhoto: z.boolean(),
  requireFacePhoto:    z.boolean(),
})

export const CreateGuardSchema = z.object({
  fullName: z.string().min(2, 'Full name required'),
  username: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// Admin-managed picklist a guard chooses from at the "what are they selling?"
// step — independent of the Products module's ProductCategory tree.
export const CreateSellOptionSchema = z.object({
  label:     z.string().min(1, 'Label is required'),
  colorHex:  z.string().optional(),
  iconName:  z.string().optional(),
  sortOrder: z.number().int().optional(),
})

export const UpdateSellOptionSchema = z.object({
  label:     z.string().min(1).optional(),
  colorHex:  z.string().optional(),
  iconName:  z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive:  z.boolean().optional(),
})

export interface GatePurposeConfigResponse {
  purpose:             'sell' | 'buy' | 'visitor' | 'other'
  requireIdPhoto:      boolean
  requireVehiclePhoto: boolean
  requireFacePhoto:    boolean
}

export type CreateGateEntryInput        = z.infer<typeof CreateGateEntrySchema>
export type UpdateGatePurposeConfigInput = z.infer<typeof UpdateGatePurposeConfigSchema>
export type CreateGuardInput            = z.infer<typeof CreateGuardSchema>
export type CreateSellOptionInput       = z.infer<typeof CreateSellOptionSchema>
export type UpdateSellOptionInput       = z.infer<typeof UpdateSellOptionSchema>
