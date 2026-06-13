'use client'

import { useCallback, useEffect, useState } from 'react'
import { useOfflineStore } from '@/stores/offlineStore'
import {
  createOfflineScaleOrder,
  getPendingScaleOrderCount,
  type CreateOfflineOrderInput,
} from '@/lib/offline/scaleOrderService'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrderLineInput {
  productId: string
  productName: string
  categoryName: string
  weight: string
  unit: string
  photoR2Keys?: string[]      // Used when online
  photoBlobs?: Blob[]         // Used when offline
}

export interface CreateOrderInput {
  customerId: string | null
  casualFirstName: string | null
  casualLastName: string | null
  casualPhone: string | null
  casualIdNumber: string | null
  lines: OrderLineInput[]
  notes: string | null
  operatorId: string
}

export interface OrderResult {
  id: string
  orderNumber: string
  isOffline: boolean
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOfflineScaleOrder() {
  const { isOnline } = useOfflineStore()
  const [pendingCount, setPendingCount] = useState(0)

  // Refresh pending count on mount and when online status changes
  useEffect(() => {
    getPendingScaleOrderCount().then(setPendingCount)
  }, [isOnline])

  /**
   * Create a scale order - routes to API when online, local storage when offline
   */
  const createOrder = useCallback(async (input: CreateOrderInput): Promise<OrderResult> => {
    if (isOnline) {
      // Online flow - use API
      const payload = input.customerId
        ? {
            customerId: input.customerId,
            lines: input.lines.map(l => ({
              productId: l.productId,
              weight: l.weight,
              photoR2Keys: l.photoR2Keys ?? [],
            })),
          }
        : {
            casualFirstName: input.casualFirstName,
            casualLastName: input.casualLastName,
            casualPhone: input.casualPhone,
            casualIdNumber: input.casualIdNumber,
            lines: input.lines.map(l => ({
              productId: l.productId,
              weight: l.weight,
              photoR2Keys: l.photoR2Keys ?? [],
            })),
          }

      const res = await fetch('/api/scale/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Failed to create order (${res.status})`)
      }

      const order = await res.json()
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        isOffline: false,
      }
    }

    // Offline flow - save locally
    const offlineInput: CreateOfflineOrderInput = {
      customerId: input.customerId,
      casualFirstName: input.casualFirstName,
      casualLastName: input.casualLastName,
      casualPhone: input.casualPhone,
      casualIdNumber: input.casualIdNumber,
      lines: input.lines.map(l => ({
        productId: l.productId,
        productName: l.productName,
        categoryName: l.categoryName,
        weight: l.weight,
        unit: l.unit,
        photoBlobs: l.photoBlobs ?? [],
      })),
      notes: input.notes,
      operatorId: input.operatorId,
    }

    const result = await createOfflineScaleOrder(offlineInput)

    // Update pending count
    const count = await getPendingScaleOrderCount()
    setPendingCount(count)

    return {
      id: result.id,
      orderNumber: result.tempOrderNumber,
      isOffline: true,
    }
  }, [isOnline])

  /**
   * Refresh the pending count (call after sync)
   */
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingScaleOrderCount()
    setPendingCount(count)
  }, [])

  return {
    isOnline,
    pendingCount,
    createOrder,
    refreshPendingCount,
  }
}
