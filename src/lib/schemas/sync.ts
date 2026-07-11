import { z } from 'zod'

export const SyncPushSchema = z.object({
  deviceToken: z.string().min(10),
  records: z.array(z.object({
    tableName: z.string(),
    recordId: z.string(),
    operation: z.enum(['create', 'update', 'delete']),
    payload: z.record(z.string(), z.unknown()),
  })).max(500),
})

export type SyncPushInput = z.infer<typeof SyncPushSchema>
