'use client'

import { useOfflineStore } from '@/stores/offlineStore'
import { enqueueMutation } from '@/lib/offline/sync'

export type OfflineMutationOpts = {
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  body: unknown
  /** Local UUID to identify this record in the sync queue */
  localId: string
  /** Called with the API response when online, or undefined when queued offline */
  onSuccess?: (data: unknown) => void
  /** Called on network/API error (online mode only) */
  onError?: (err: unknown) => void
}

/**
 * Returns an offline-aware mutation function.
 *
 * - Online: calls the real API and returns the response.
 * - Offline: enqueues the mutation in IndexedDB syncQueue and resolves immediately.
 */
export function useOfflineMutation() {
  const isOnline = useOfflineStore((s) => s.isOnline)

  async function mutate(opts: OfflineMutationOpts): Promise<{ queued: boolean; data?: unknown }> {
    if (isOnline) {
      let res: Response
      try {
        res = await fetch(opts.url, {
          method: opts.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts.body),
        })
      } catch {
        // The connectivity poll (useOnlineStatus) can lag a real outage by up
        // to POLL_INTERVAL_MS, or the request can be the one that first
        // discovers it. Either way, a network-level failure here means the
        // transaction is unreachable right now, not invalid — queue it
        // instead of throwing it away, same as if we'd already known we were
        // offline.
        await enqueueMutation({ method: opts.method, url: opts.url, body: opts.body, localId: opts.localId })
        opts.onSuccess?.(undefined)
        return { queued: true }
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => String(res.status))
        const err = new Error(errText)
        opts.onError?.(err)
        throw err
      }
      const data = await res.json().catch(() => null)
      opts.onSuccess?.(data)
      return { queued: false, data }
    } else {
      // Offline — enqueue
      await enqueueMutation({
        method: opts.method,
        url: opts.url,
        body: opts.body,
        localId: opts.localId,
      })
      opts.onSuccess?.(undefined)
      return { queued: true }
    }
  }

  return { mutate, isOnline }
}
