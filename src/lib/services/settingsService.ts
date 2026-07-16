import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

/** Setting key holding the R2 object key of the company logo (documents header). */
export const LOGO_SETTING_KEY = 'companyLogoR2Key'

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.systemSettings.findMany()
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSettings.findUnique({ where: { tenantId_key: { tenantId: requireTenantId(), key } } })
  return row?.value ?? null
}

export async function upsertUserSettings(userId: string, data: Record<string, string>): Promise<void> {
  const tenantId = requireTenantId()
  const prefix = `user:${userId}:`
  const allowed = Object.entries(data).filter(([key]) => key.startsWith(prefix))
  if (allowed.length === 0) throw new Error('No allowed keys provided')

  await prisma.$transaction(async (tx) => {
    for (const [key, value] of allowed) {
      await tx.systemSettings.upsert({
        where:  { tenantId_key: { tenantId, key } },
        update: { value: String(value) },
        create: { tenantId, key, value: String(value) },
      })
    }
  })
  logger.info({ userId, keys: allowed.map(([k]) => k) }, 'user-settings.updated')
}

export async function upsertGlobalSettings(data: Record<string, string>, adminId: string): Promise<void> {
  const tenantId = requireTenantId()
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(data)) {
      await tx.systemSettings.upsert({
        where:  { tenantId_key: { tenantId, key } },
        update: { value: String(value) },
        create: { tenantId, key, value: String(value) },
      })
    }
  })
  logger.info({ adminId, keys: Object.keys(data) }, 'global-settings.updated')
}
