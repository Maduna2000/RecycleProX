import { create } from 'zustand'

interface UpdateState {
  status: 'idle' | 'available' | 'downloading' | 'ready'
  version?: string
  percent?: number
  setStatus: (v: { status: UpdateState['status']; version?: string; percent?: number }) => void
}

export const useUpdateStore = create<UpdateState>()((set) => ({
  status: 'idle',
  setStatus: (v) => set(v),
}))
