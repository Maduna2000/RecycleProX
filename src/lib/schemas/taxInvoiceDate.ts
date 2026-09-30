import { z } from 'zod'

// `date: null` clears the override so the invoice goes back to the payment date.
export const SetTaxInvoiceDateSchema = z.object({
  date: z.string().datetime({ offset: true, message: 'Invalid date' }).nullable(),
})
