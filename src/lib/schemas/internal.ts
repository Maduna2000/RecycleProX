import { z } from 'zod'

export const ProvisionTenantSchema = z.object({
  companySlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  // Accepted-but-ignored for backward compatibility with the Portal's
  // existing request body — tenants no longer get their own Postgres
  // schema (see i-need-you-to-vectorized-pumpkin.md Section 5), so this
  // field carries no meaning on the Web side anymore.
  schemaName: z.string().optional(),
  companyName: z.string().min(2),
  ownerName: z.string().min(2),
})

export type ProvisionTenantInput = z.infer<typeof ProvisionTenantSchema>

// Registers an ALREADY-EXISTING schema (its tables, data, and admin user
// already exist — e.g. Golden Key's own production data living in `public`
// since before multi-tenancy existed) as a formal Tenant, without running
// provisionTenantSchema/seedTenantSchema — those would try to create/wipe a
// schema that already has real data in it. One-off registration, not the
// normal signup path (see registerExistingTenant in tenantProvisioningService.ts).
export const RegisterExistingTenantSchema = z.object({
  companySlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  schemaName: z.string().min(3).regex(/^[a-z][a-z0-9_]{2,50}$/),
  companyName: z.string().min(2),
})

export type RegisterExistingTenantInput = z.infer<typeof RegisterExistingTenantSchema>

// Called by the sibling "golden-key-control-tower" app's sync runner —
// pulls one tenant's aggregated KPIs for a period. periodEnd is exclusive
// for period-flow metrics (revenue, buying, expenses, visit counts) and
// inclusive as the as-at date for snapshot metrics (stock value, loans/
// debts outstanding, cash on hand).
export const KpiExportRequestSchema = z.object({
  tenantId: z.string().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
})

export type KpiExportRequestInput = z.infer<typeof KpiExportRequestSchema>
