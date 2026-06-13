'use client'

import { useEffect, useRef } from 'react'
import { useOfflineStore } from '@/stores/offlineStore'
import { offlineDB } from '@/lib/offline/db'
import { triggerSync } from '@/lib/offline/sync'

const POLL_INTERVAL_MS = 15_000
const SYNC_INTERVAL_MS = 30_000 // Sync pending orders every 30 seconds when online

export function useOnlineStatus() {
  const { isOnline, setOnline, setPendingCount } = useOfflineStore()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasOfflineRef = useRef(false)
  const initialCheckDoneRef = useRef(false)

  async function checkConnectivity(): Promise<boolean> {
    try {
      const res = await fetch('/api/ping', { cache: 'no-store' })
      return res.ok
    } catch {
      return false
    }
  }

  async function refreshPendingCount() {
    const queueCount = await offlineDB.syncQueue
      .where('status').equals('pending')
      .count()
    const scaleCount = await offlineDB.scaleOrders
      .where('syncStatus').anyOf(['pending', 'syncing'])
      .count()
    setPendingCount(queueCount + scaleCount)
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function stopSyncInterval() {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
      syncIntervalRef.current = null
    }
  }

  function startSyncInterval() {
    stopSyncInterval()
    // Periodically sync pending orders when online
    syncIntervalRef.current = setInterval(() => {
      triggerSync()
    }, SYNC_INTERVAL_MS)
  }

  function startPolling() {
    stopPolling()
    pollRef.current = setInterval(async () => {
      const alive = await checkConnectivity()
      if (alive) {
        stopPolling()
        setOnline(true)
        wasOfflineRef.current = false
        startSyncInterval()
        triggerSync()
      }
    }, POLL_INTERVAL_MS)
  }

  useEffect(() => {
    // Hydrate pending count on mount
    refreshPendingCount()

    async function handleOnline() {
      const alive = await checkConnectivity()
      if (alive) {
        setOnline(true)
        stopPolling()
        startSyncInterval()
        // Always try to sync when coming online or on focus
        triggerSync()
        wasOfflineRef.current = false
      }
    }

    function handleOffline() {
      setOnline(false)
      wasOfflineRef.current = true
      stopSyncInterval()
      startPolling()
    }

    // Initial check - verify actual connectivity and sync if online
    async function initialCheck() {
      if (initialCheckDoneRef.current) return
      initialCheckDoneRef.current = true

      if (!navigator.onLine) {
        handleOffline()
      } else {
        // Even if navigator says online, verify actual connectivity
        const alive = await checkConnectivity()
        if (alive) {
          setOnline(true)
          startSyncInterval()
          // Trigger sync on initial load to sync any pending orders
          triggerSync()
        } else {
          handleOffline()
        }
      }
    }

    initialCheck()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    // Also sync on tab focus
    window.addEventListener('focus', handleOnline)

    return () => {
      stopPolling()
      stopSyncInterval()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleOnline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { isOnline, refreshPendingCount }
}
