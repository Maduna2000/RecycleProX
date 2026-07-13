import { z } from 'zod'

export const FileSupportTicketSchema = z.object({
  subject: z.string().min(2),
  message: z.string().min(2),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
})

export type FileSupportTicketInput = z.infer<typeof FileSupportTicketSchema>
