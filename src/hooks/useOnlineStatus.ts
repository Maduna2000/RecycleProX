'use client'

import { useEffect, useRef } from 'react'
import { useOfflineStore } from '@/stores/offlineStore'
import { offlineDB } from '@/lib/offline/db'
import { triggerSync } from '@/lib/offline/sync'

const POLL_INTERVAL_MS = 15_000

export function useOnlineStatus() {
  const { isOnline, setOnline, setPendingCount } = useOfflineStore()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasOfflineRef = useRef(false)

  async function checkConnectivity(): Promise<boolean> {
    try {
      const res = await fetch('/api/ping', { cache: 'no-store' })
      return res.ok
    } catch {
      return false
    }
  }

  async function refreshPendingCount() {
    const count = await offlineDB.syncQueue
      .where('status').equals('pending')
      .count()
    setPendingCount(count)
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startPolling() {
    stopPolling()
    pollRef.current = setInterval(async () => {
      const alive = await checkConnectivity()
      if (alive) {
        stopPolling()
        setOnline(true)
        wasOfflineRef.current = false
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
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false
          triggerSync()
        }
      }
    }

    function handleOffline() {
      setOnline(false)
      wasOfflineRef.current = true
      startPolling()
    }

    // Initial check
    if (!navigator.onLine) {
      handleOffline()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    // Also sync on tab focus if we were offline
    window.addEventListener('focus', handleOnline)

    return () => {
      stopPolling()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleOnline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { isOnline, refreshPendingCount }
}
