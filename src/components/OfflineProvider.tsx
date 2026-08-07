'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePrinterStatus } from '@/hooks/usePrinterStatus'
import { useOfflineStore } from '@/stores/offlineStore'
import { runSeeder } from '@/lib/offline/seeder'
import { registerSyncCallbacks } from '@/lib/offline/sync'
import { resetStuckSyncingOrders } from '@/lib/offline/scaleOrderService'

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { setPendingCount, setSyncing } = useOfflineStore()
  useOnlineStatus()
  usePrinterStatus()

  useEffect(() => {
    // Register callbacks the sync engine needs to update UI state + show toasts
    registerSyncCallbacks({
      setPendingCount,
      setSyncing,
      showToast: (msg, type) => {
        if (type === 'success') toast.success(msg)
        else toast.error(msg)
      },
    })

    // Recover any scale order left stuck at 'syncing' by a crash/reload
    // mid-sync — see resetStuckSyncingOrders's own comment.
    resetStuckSyncingOrders().catch(() => {})

    // Seed IndexedDB with product/customer/price data (skips if fresh)
    runSeeder().catch(() => {
      // Seeding is best-effort; failing silently is fine
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
