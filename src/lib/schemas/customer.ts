import { z } from 'zod'
import { validateSaId } from '@/lib/utils/saId'

// Coerce phone to E.164 (+27XXXXXXXXX)
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`
  if (digits.length === 9) return `+27${digits}`
  return `+${digits}`
}

const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .transform(toE164)
  .refine((v) => /^\+27\d{9}$/.test(v), 'Phone must be a valid South African number')

const idNumberSchema = z
  .string()
  .regex(/^\d{13}$/, 'ID number must be exactly 13 digits')
  .superRefine((v, ctx) => {
    const result = validateSaId(v)
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error ?? 'Invalid SA ID number' })
    }
  })

export const CreateCustomerSchema = z.object({
  customerType: z.enum(['casual', 'account']),
  idNumber: idNumberSchema,
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  companyName: z.string().optional(),
  phone: phoneSchema,
  email: z.string().email('Invalid email address').optional().or(z.literal('')).transform(v => v || undefined),
  physicalAddress: z.string().optional(),
  postalAddress: z.string().optional(),
  vatNumber: z
    .string()
    .regex(/^4\d{9}$/, 'VAT number must be 10 digits starting with 4')
    .optional()
    .or(z.literal(''))
    .transform(v => v || undefined),
  priceGroupId: z.string().uuid().optional(),
})

export const QuickCreateSchema = z.object({
  idNumber: idNumberSchema,
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: phoneSchema,
})

export const BlacklistSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
})

export const UpdateCustomerSchema = CreateCustomerSchema.partial().omit({ idNumber: true })

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>
export type CreateCustomerFormInput = z.input<typeof CreateCustomerSchema>
export type QuickCreateInput = z.infer<typeof QuickCreateSchema>
export type BlacklistInput = z.infer<typeof BlacklistSchema>
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>
export type UpdateCustomerFormInput = z.input<typeof UpdateCustomerSchema>
