import { z } from 'zod'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { validateSaId } from '@/lib/utils/saId'

// International phone validation — accepts any country's number in correct
// E.164 format. A bare local number (no leading +, no country code) is
// assumed to be Eswatini (this yard's home country) so existing 8-digit
// entries like "76123456" keep working without staff having to type +268.
// Any number that already includes a country code (+27..., +44..., 268...)
// is validated against THAT country's own numbering rules instead — the
// requirement is a correctly formatted number, not a specific country.
function toE164(phone: string): string | null {
  const trimmed = phone.trim()
  const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`
  // Try as an already-international number first (e.g. +27821234567).
  const intl = parsePhoneNumberFromString(withPlus)
  if (intl?.isValid()) return intl.number
  // Fall back to treating it as a local Eswatini number (e.g. 76123456 or
  // 268 76123456 without the +).
  const local = parsePhoneNumberFromString(trimmed, 'SZ')
  if (local?.isValid()) return local.number
  // Eswatini's own numbering plan has no leading-trunk-zero convention, but
  // staff have long typed local numbers as "076123456" out of habit (the
  // pattern used elsewhere in the region) — strip a single leading zero and
  // retry rather than rejecting an otherwise-correct local number over it.
  if (trimmed.startsWith('0')) {
    const unzeroed = parsePhoneNumberFromString(trimmed.slice(1), 'SZ')
    if (unzeroed?.isValid()) return unzeroed.number
  }
  return null
}

const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .transform((v, ctx) => {
    const e164 = toE164(v)
    if (!e164) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number, e.g. +268 7612 3456 or +27 82 123 4567' })
      return z.NEVER
    }
    return e164
  })

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
  companyRegNumber: z.string().max(50).optional(),
  contactPerson:    z.string().optional(),
  phone:            phoneSchema,
  landline:         z.string().max(20).optional(),
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
  marketSector:     z.enum(['formal', 'informal']).optional(),
  dealerCategory:   z.enum(['casual', 'dealer_1', 'dealer_2', 'dealer_3']).optional(),
  // VAT is opt-in: a new account has no VAT applied unless explicitly ticked.
  zeroRated:        z.boolean().optional().default(true),
  isActive:         z.boolean().optional().default(true),
  // Set by the UI only after staff has seen and dismissed a
  // phone-number-conflict warning (see PhoneNumberConflictError in
  // customerService.ts) — the first save attempt always omits it so the
  // conflict, if any, actually gets shown before creation succeeds.
  confirmDifferentPerson: z.boolean().optional(),
})

// Quick-create (casual, on-the-fly at Scale/Gate/Purchases): same
// international validation as phoneSchema, kept as a separate export only
// because QuickCreateSchema has its own distinct error message.
const quickCreatePhoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .transform((v, ctx) => {
    const e164 = toE164(v)
    if (!e164) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number, e.g. +268 7612 3456 or +27 82 123 4567' })
      return z.NEVER
    }
    return e164
  })

export const QuickCreateSchema = z.object({
  idNumber:        idNumberSchema.optional(),
  firstName:       z.string().min(1, 'First name is required'),
  lastName:        z.string().min(1, 'Last name is required'),
  phone:           quickCreatePhoneSchema,
  physicalAddress: z.string().max(200).optional(),
  // See CreateCustomerSchema's confirmDifferentPerson — same override, for
  // the quick-create-a-casual-on-the-fly path (Scale/Gate/Purchases).
  confirmDifferentPerson: z.boolean().optional(),
})

export const BlacklistSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
})

export const UpdateCustomerSchema = CreateCustomerSchema.partial().omit({ idNumber: true }).extend({
  // Editable, but manager/admin only (see updateCustomer) — correcting a
  // data-entry typo is legitimate. Re-declared as optional rather than
  // reusing the base schema's .default()-bearing field directly, per the
  // same .partial()+.default() landmine noted on zeroRated/primaryFunction
  // below — idNumberSchema itself carries no default, but matching the
  // pattern here keeps this file consistent and safe against future edits.
  idNumber:       idNumberSchema.optional(),
  idPhotoR2Key:   z.string().nullable().optional(),
  isActive:       z.boolean().optional(),
  dealerCategory: z.enum(['casual', 'dealer_1', 'dealer_2', 'dealer_3']).nullable().optional(),
  priceGroupId:   z.string().uuid().nullable().optional(),
  // Both of these override an inherited .default(...) — a partial update
  // payload that omits the field must leave the existing customer's value
  // alone, not silently reset it (Zod's .partial() keeps the base schema's
  // default active for an omitted key, confirmed empirically before this
  // change — see zeroRated, the first field this bit).
  zeroRated:       z.boolean().optional(),
  primaryFunction: z.enum(['customer', 'supplier', 'both']).optional(),
})

export const UploadCustomerDocumentSchema = z.object({
  documentType: z.enum(['id_copy', 'passport', 'drivers_licence', 'trading_licence', 'company_registration', 'eea_license', 'sars_certificate', 'other']),
  fileName:     z.string().min(1).max(255),
  r2Key:        z.string().min(1),
  notes:        z.string().max(500).optional(),
})

export type CreateCustomerInput          = z.infer<typeof CreateCustomerSchema>
export type CreateCustomerFormInput      = z.input<typeof CreateCustomerSchema>
export type QuickCreateInput             = z.infer<typeof QuickCreateSchema>
export type BlacklistInput               = z.infer<typeof BlacklistSchema>
export type UpdateCustomerInput          = z.infer<typeof UpdateCustomerSchema>
export type UpdateCustomerFormInput      = z.input<typeof UpdateCustomerSchema>
export type UploadCustomerDocumentInput  = z.infer<typeof UploadCustomerDocumentSchema>
