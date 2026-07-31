import { z } from 'zod'

export const CreateExpenseTypeSchema = z.object({
  name:     z.string().min(1, 'Name is required'),
  parentId: z.string().uuid().optional(),
  sortOrder: z.coerce.number().int().default(0),
})

export const CreateExpenseSchema = z.object({
  expenseTypeId: z.string().uuid('Expense type is required'),
  description:   z.string().min(1, 'Description is required'),
  amount:        z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : parseFloat(String(v))),
    z.number().positive('Amount must be positive'),
  ),
  includesVat:   z.boolean().default(false),
  paymentMethod: z.enum(['cash', 'eft']).default('cash'),
  isPending:     z.boolean().default(false),
})

export const UpdateExpenseSchema = z.object({
  expenseTypeId: z.string().uuid().optional(),
  description:   z.string().min(1).optional(),
  amount:        z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : parseFloat(String(v))),
    z.number().positive().optional(),
  ),
  includesVat:   z.boolean().optional(),
  paymentMethod: z.enum(['cash', 'eft']).optional(),
  updatedAt:     z.string().datetime(), // For optimistic locking
})

export const ApproveExpenseSchema = z.object({
  notes: z.string().optional(),
})

export const VoidExpenseSchema = z.object({
  reason: z.string().min(5, 'Void reason must be at least 5 characters'),
})

export const SettlePendingExpenseSchema = z.object({
  changeReceived: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? 0 : parseFloat(String(v))),
    z.number().min(0, 'Change cannot be negative'),
  ),
  updatedAt: z.string().datetime(),
})

export type CreateExpenseTypeInput      = z.infer<typeof CreateExpenseTypeSchema>
export type CreateExpenseInput          = z.infer<typeof CreateExpenseSchema>
export type CreateExpenseFormInput      = z.input<typeof CreateExpenseSchema>
export type ApproveExpenseInput         = z.infer<typeof ApproveExpenseSchema>
export type VoidExpenseInput            = z.infer<typeof VoidExpenseSchema>
export type UpdateExpenseInput          = z.infer<typeof UpdateExpenseSchema>
export type SettlePendingExpenseInput   = z.infer<typeof SettlePendingExpenseSchema>

export const UploadExpenseAttachmentSchema = z.object({
  r2Key:    z.string().min(1),
  fileName: z.string().min(1).max(255),
  notes:    z.string().max(500).optional(),
})
export type UploadExpenseAttachmentInput = z.infer<typeof UploadExpenseAttachmentSchema>
