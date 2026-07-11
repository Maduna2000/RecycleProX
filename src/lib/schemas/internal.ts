import { z } from 'zod'

export const ProvisionTenantSchema = z.object({
  companySlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  schemaName: z.string().min(3).regex(/^[a-z][a-z0-9_]{2,50}$/),
  companyName: z.string().min(2),
  ownerName: z.string().min(2),
})

export type ProvisionTenantInput = z.infer<typeof ProvisionTenantSchema>
