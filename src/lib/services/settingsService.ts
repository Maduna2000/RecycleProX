import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import { CURRENCY_SETTING_KEY, DEFAULT_CURRENCY_CODE, currencySymbolFor, isKnownCurrencyCode } from '@/lib/constants/currencies'

export class InvalidCurrencyCodeError extends Error {
  constructor(code: string) { super(`"${code}" is not a recognised currency code`); this.name = 'InvalidCurrencyCodeError' }
}

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

/** The tenant's single system-wide currency code (ISO 4217), e.g. "SZL". */
export function currencyCodeFromSettings(settings: Record<string, string>): string {
  return settings[CURRENCY_SETTING_KEY] ?? DEFAULT_CURRENCY_CODE
}

/** The display symbol for the tenant's configured currency, e.g. "E". */
export function currencySymbolFromSettings(settings: Record<string, string>): string {
  return currencySymbolFor(currencyCodeFromSettings(settings))
}

export async function getCurrencyCode(): Promise<string> {
  return (await getSetting(CURRENCY_SETTING_KEY)) ?? DEFAULT_CURRENCY_CODE
}

export async function getCurrencySymbol(): Promise<string> {
  return currencySymbolFor(await getCurrencyCode())
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
  if (CURRENCY_SETTING_KEY in data && !isKnownCurrencyCode(data[CURRENCY_SETTING_KEY]!)) {
    throw new InvalidCurrencyCodeError(data[CURRENCY_SETTING_KEY]!)
  }
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
