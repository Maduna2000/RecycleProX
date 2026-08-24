import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'
import { CURRENCY_SETTING_KEY, currencyOptionFor, type CurrencyOption } from '@/lib/constants/currencies'

/**
 * The tenant's single system-wide currency (Settings → Currency), read from
 * the same /api/settings SWR cache every other settings field uses — no
 * extra request, and it updates everywhere the moment an admin saves a new
 * choice in Settings.
 */
export function useSystemCurrency(): CurrencyOption {
  const { data } = useSWR<Record<string, string>>('/api/settings', fetcher)
  return currencyOptionFor(data?.[CURRENCY_SETTING_KEY])
}
