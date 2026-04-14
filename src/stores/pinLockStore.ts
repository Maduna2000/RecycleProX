import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface PinLockState {
  isLocked: boolean
  failedPinAttempts: number
  lastActivity: number
  lock: () => void
  unlock: () => void
  incrementFailedAttempts: () => void
  resetFailedAttempts: () => void
  updateLastActivity: () => void
}

export const usePinLockStore = create<PinLockState>()(
  persist(
    (set) => ({
      isLocked: false,
      failedPinAttempts: 0,
      lastActivity: Date.now(),
      lock:                  () => set({ isLocked: true }),
      unlock:                () => set({ isLocked: false, failedPinAttempts: 0, lastActivity: Date.now() }),
      incrementFailedAttempts: () => set((s) => ({ failedPinAttempts: s.failedPinAttempts + 1 })),
      resetFailedAttempts:   () => set({ failedPinAttempts: 0 }),
      updateLastActivity:    () => set({ lastActivity: Date.now() }),
    }),
    {
      name: 'rpx-pin-lock',
      // sessionStorage clears when browser tab is fully closed but survives F5 / Ctrl+R
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? sessionStorage : localStorage,
      ),
      // Only persist the lock state and last-activity timestamp.
      // failedPinAttempts intentionally resets on reload (3 fresh attempts after refresh).
      partialize: (s) => ({ isLocked: s.isLocked, lastActivity: s.lastActivity }),
    },
  ),
)
