/**
 * Server-side report registry — maps report ids (from the client-safe
 * catalog) to their params schema and data builder. The dynamic API route
 * consumes this; adding a report = one builder + one entry here + one
 * catalog entry.
 */
import type { z } from 'zod'
import type { ReportDocument, ReportMeta } from '@/lib/reports/types'
import { REPORT_CATALOG } from '@/lib/reports/catalog'
import { PurchasesByProductCategoryParamsSchema } from '@/lib/schemas/report'
import { buildPurchasesByProductCategory } from './builders/purchases'

type MetaBase = Omit<ReportMeta, 'rowCount'>

export interface ReportDefinition {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paramsSchema: z.ZodType<any, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (params: any, meta: MetaBase) => Promise<ReportDocument>
}

export const REPORT_REGISTRY: Record<string, ReportDefinition> = {
  'purchases-by-product-category': {
    paramsSchema: PurchasesByProductCategoryParamsSchema,
    build: buildPurchasesByProductCategory,
  },
}

// Every catalog entry must have a registry implementation — fail fast at
// module load (build/boot time) rather than 404ing at request time.
for (const entry of REPORT_CATALOG) {
  if (!REPORT_REGISTRY[entry.id]) {
    throw new Error(`Report catalog entry "${entry.id}" has no registry implementation`)
  }
}
