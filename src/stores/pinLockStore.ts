import { create } from 'zustand'

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

export const usePinLockStore = create<PinLockState>((set) => ({
  isLocked: false,
  failedPinAttempts: 0,
  lastActivity: Date.now(),
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false, failedPinAttempts: 0, lastActivity: Date.now() }),
  incrementFailedAttempts: () => set((s) => ({ failedPinAttempts: s.failedPinAttempts + 1 })),
  resetFailedAttempts: () => set({ failedPinAttempts: 0 }),
  updateLastActivity: () => set({ lastActivity: Date.now() }),
}))
