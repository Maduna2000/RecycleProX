'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useOfflineStore } from '@/stores/offlineStore'
import { runSeeder } from '@/lib/offline/seeder'
import { registerSyncCallbacks } from '@/lib/offline/sync'

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { setPendingCount, setSyncing } = useOfflineStore()
  useOnlineStatus()

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

    // Seed IndexedDB with product/customer/price data (skips if fresh)
    runSeeder().catch(() => {
      // Seeding is best-effort; failing silently is fine
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
