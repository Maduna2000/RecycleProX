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
  paymentMethod: z.enum(['cash', 'eft', 'cheque']).default('cash'),
  chequeNo:      z.string().optional(),
})

export const ApproveExpenseSchema = z.object({
  notes: z.string().optional(),
})

export type CreateExpenseTypeInput = z.infer<typeof CreateExpenseTypeSchema>
export type CreateExpenseInput     = z.infer<typeof CreateExpenseSchema>
export type CreateExpenseFormInput = z.input<typeof CreateExpenseSchema>
export type ApproveExpenseInput    = z.infer<typeof ApproveExpenseSchema>

export const UploadExpenseAttachmentSchema = z.object({
  r2Key:    z.string().min(1),
  fileName: z.string().min(1).max(255),
  notes:    z.string().max(500).optional(),
})
export type UploadExpenseAttachmentInput = z.infer<typeof UploadExpenseAttachmentSchema>
