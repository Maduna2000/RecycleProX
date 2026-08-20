import { create } from 'zustand'

interface ConfigState {
  needsRestart: boolean
  setNeedsRestart: (v: boolean) => void
}

export const useConfigStore = create<ConfigState>()((set) => ({
  needsRestart: false,
  setNeedsRestart: (v) => set({ needsRestart: v }),
}))
