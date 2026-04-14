import { z } from 'zod'
import { validateSaId } from '@/lib/utils/saId'

// Coerce phone to E.164 (+268XXXXXXXX) — Eswatini (+268, 8-digit local numbers)
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Already has country code: +268XXXXXXXX or 268XXXXXXXX
  if (digits.startsWith('268') && digits.length === 11) return `+${digits}`
  // 8-digit local number (standard Eswatini format)
  if (digits.length === 8) return `+268${digits}`
  // Leading zero variant (non-standard but tolerate)
  if (digits.startsWith('0') && digits.length === 9) return `+268${digits.slice(1)}`
  return `+${digits}`
}

const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .transform(toE164)
  .refine((v) => /^\+268\d{8}$/.test(v), 'Phone must be a valid Eswatini number (+268 followed by 8 digits)')

const idNumberSchema = z
  .string()
  .min(5, 'National ID number is too short')
  .max(20, 'National ID number is too long')
  .regex(/^[A-Za-z0-9\-\/]+$/, 'National ID may only contain letters, digits, hyphens, or slashes')
  .superRefine((v, ctx) => {
    const result = validateSaId(v)
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error ?? 'Invalid National ID number' })
    }
  })

// Optional date string (from <input type="date">) → Date | undefined
const optionalDateSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? new Date(v) : undefined))

// Optional positive number (from text input) → number | undefined
const optionalPositiveNumber = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? undefined : parseFloat(String(v))),
  z.number().positive('Must be a positive amount').optional(),
)

export const CreateCustomerSchema = z.object({
  customerType:     z.enum(['casual', 'account']),
  primaryFunction:  z.enum(['customer', 'supplier', 'both']).default('supplier'),
  idNumber:         idNumberSchema,
  firstName:        z.string().min(1, 'First name is required'),
  lastName:         z.string().min(1, 'Last name is required'),
  dateOfBirth:      optionalDateSchema,
  gender:           z.enum(['male', 'female', 'other']).optional(),
  nationality:      z.string().optional(),
  companyName:      z.string().optional(),
  contactPerson:    z.string().optional(),
  phone:            phoneSchema,
  email:            z.string().email('Invalid email address').optional().or(z.literal('')).transform(v => v || undefined),
  physicalAddress:  z.string().optional(),
  postalAddress:    z.string().optional(),
  vatNumber:        z
    .string()
    .regex(/^\d{7,15}$/, 'VAT number must be 7–15 digits')
    .optional()
    .or(z.literal(''))
    .transform(v => v || undefined),
  bankName:         z.string().optional(),
  bankAccountNo:    z.string().optional(),
  bankBranchCode:   z.string().optional(),
  creditLimit:      optionalPositiveNumber,
  policeRegisterNo: z.string().optional(),
  licenseNumber:    z.string().optional(),
  licenseExpiry:    optionalDateSchema,
  tradeCommodities: z.array(z.string()).optional(),
  customerNotes:    z.string().optional(),
  priceGroupId:     z.string().uuid().optional(),
})

export const QuickCreateSchema = z.object({
  idNumber:  idNumberSchema,
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  phone:     phoneSchema,
})

export const BlacklistSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
})

export const UpdateCustomerSchema = CreateCustomerSchema.partial().omit({ idNumber: true }).extend({
  idPhotoR2Key: z.string().nullable().optional(),
  isActive:     z.boolean().optional(),
})

export type CreateCustomerInput     = z.infer<typeof CreateCustomerSchema>
export type CreateCustomerFormInput = z.input<typeof CreateCustomerSchema>
export type QuickCreateInput        = z.infer<typeof QuickCreateSchema>
export type BlacklistInput          = z.infer<typeof BlacklistSchema>
export type UpdateCustomerInput     = z.infer<typeof UpdateCustomerSchema>
export type UpdateCustomerFormInput = z.input<typeof UpdateCustomerSchema>
