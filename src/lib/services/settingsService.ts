import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.systemSettings.findMany()
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSettings.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function upsertUserSettings(userId: string, data: Record<string, string>): Promise<void> {
  const prefix = `user:${userId}:`
  const allowed = Object.entries(data).filter(([key]) => key.startsWith(prefix))
  if (allowed.length === 0) throw new Error('No allowed keys provided')

  await prisma.$transaction(
    allowed.map(([key, value]) =>
      prisma.systemSettings.upsert({
        where:  { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  )
  logger.info({ userId, keys: allowed.map(([k]) => k) }, 'user-settings.updated')
}

export async function upsertGlobalSettings(data: Record<string, string>, adminId: string): Promise<void> {
  await prisma.$transaction(
    Object.entries(data).map(([key, value]) =>
      prisma.systemSettings.upsert({
        where:  { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  )
  logger.info({ adminId, keys: Object.keys(data) }, 'global-settings.updated')
}
