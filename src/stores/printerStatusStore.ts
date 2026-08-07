import { create } from 'zustand'

interface PrinterStatusState {
  configured: boolean
  connected: boolean
  checked: boolean
  setStatus: (v: { configured: boolean; connected: boolean }) => void
}

export const usePrinterStatusStore = create<PrinterStatusState>()((set) => ({
  configured: false,
  connected: false,
  checked: false,
  setStatus: (v) => set({ ...v, checked: true }),
}))
