import useSWR from 'swr'
import { offlineFetcher } from '@/lib/offline/responseCache'
import { CURRENCY_SETTING_KEY, currencyOptionFor, type CurrencyOption } from '@/lib/constants/currencies'

/**
 * The tenant's single system-wide currency (Settings → Currency), read from
 * the same /api/settings SWR cache every other settings field uses — no
 * extra request, and it updates everywhere the moment an admin saves a new
 * choice in Settings.
 *
 * Used on every till screen (Purchases/Sales/Float/Cash-up all show a
 * currency symbol), so a live-fetch failure falling back to the generic
 * DEFAULT_CURRENCY_CODE instead of the tenant's actual choice would be a
 * visible wrong-symbol regression during exactly an outage — offlineFetcher
 * caches the last successful response and serves that instead.
 */
export function useSystemCurrency(): CurrencyOption {
  const { data } = useSWR<Record<string, string>>('/api/settings', offlineFetcher)
  return currencyOptionFor(data?.[CURRENCY_SETTING_KEY])
}
