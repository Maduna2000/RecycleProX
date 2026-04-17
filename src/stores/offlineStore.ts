import { create } from 'zustand'

interface OfflineState {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
  setOnline: (v: boolean) => void
  setPendingCount: (n: number) => void
  setSyncing: (v: boolean) => void
}

export const useOfflineStore = create<OfflineState>()((set) => ({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
  setOnline:       (v) => set({ isOnline: v }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setSyncing:      (v) => set({ isSyncing: v }),
}))
