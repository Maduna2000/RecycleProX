import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  PrinterConfig,
  CreatePrinterConfig,
  UpdatePrinterConfig,
  DiscoveredDevice,
  PAPER_WIDTH_COLUMNS,
} from '@/lib/schemas/printer'

// Local storage key
const STORAGE_KEY = 'scale-station-printers'

interface PrinterState {
  // Saved printer configurations
  printers: PrinterConfig[]
  defaultPrinterId: string | null

  // Scanning state (not persisted)
  isScanning: boolean
  discoveredDevices: DiscoveredDevice[]
  scanError: string | null

  // Actions
  addPrinter: (config: CreatePrinterConfig) => PrinterConfig
  updatePrinter: (id: string, config: Partial<UpdatePrinterConfig>) => void
  removePrinter: (id: string) => void
  setDefault: (id: string) => void
  clearDefault: () => void

  // Scanning actions
  setScanning: (isScanning: boolean) => void
  setDiscoveredDevices: (devices: DiscoveredDevice[]) => void
  addDiscoveredDevice: (device: DiscoveredDevice) => void
  clearDiscoveredDevices: () => void
  setScanError: (error: string | null) => void

  // Getters
  getActivePrinter: () => PrinterConfig | null
  getPrinterById: (id: string) => PrinterConfig | undefined
  getColumnsForPrinter: (id?: string) => 32 | 48
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set, get) => ({
      // Initial state
      printers: [],
      defaultPrinterId: null,
      isScanning: false,
      discoveredDevices: [],
      scanError: null,

      // Add a new printer configuration
      addPrinter: (config: CreatePrinterConfig) => {
        const newPrinter: PrinterConfig = {
          ...config,
          id: crypto.randomUUID(),
        }

        set(state => {
          // If this is the first printer or marked as default, set as default
          const isFirstOrDefault = state.printers.length === 0 || config.isDefault

          return {
            printers: [...state.printers, newPrinter],
            defaultPrinterId: isFirstOrDefault ? newPrinter.id : state.defaultPrinterId,
          }
        })

        return newPrinter
      },

      // Update an existing printer configuration
      updatePrinter: (id: string, updates: Partial<UpdatePrinterConfig>) => {
        set(state => ({
          printers: state.printers.map(p =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }))
      },

      // Remove a printer configuration
      removePrinter: (id: string) => {
        set(state => {
          const newPrinters = state.printers.filter(p => p.id !== id)
          // If we removed the default printer, set a new default
          const newDefaultId = state.defaultPrinterId === id
            ? (newPrinters[0]?.id ?? null)
            : state.defaultPrinterId

          return {
            printers: newPrinters,
            defaultPrinterId: newDefaultId,
          }
        })
      },

      // Set a printer as the default
      setDefault: (id: string) => {
        set({ defaultPrinterId: id })
      },

      // Clear the default printer
      clearDefault: () => {
        set({ defaultPrinterId: null })
      },

      // Scanning state management
      setScanning: (isScanning: boolean) => {
        set({ isScanning })
      },

      setDiscoveredDevices: (devices: DiscoveredDevice[]) => {
        set({ discoveredDevices: devices })
      },

      addDiscoveredDevice: (device: DiscoveredDevice) => {
        set(state => {
          // Avoid duplicates by address
          const exists = state.discoveredDevices.some(d => d.address === device.address)
          if (exists) return state
          return { discoveredDevices: [...state.discoveredDevices, device] }
        })
      },

      clearDiscoveredDevices: () => {
        set({ discoveredDevices: [], scanError: null })
      },

      setScanError: (error: string | null) => {
        set({ scanError: error })
      },

      // Get the active (default) printer configuration
      getActivePrinter: () => {
        const state = get()
        if (!state.defaultPrinterId) return null
        return state.printers.find(p => p.id === state.defaultPrinterId) ?? null
      },

      // Get a printer by ID
      getPrinterById: (id: string) => {
        return get().printers.find(p => p.id === id)
      },

      // Get column count for a printer (or default printer)
      getColumnsForPrinter: (id?: string) => {
        const state = get()
        const printerId = id ?? state.defaultPrinterId
        if (!printerId) return 32 // Default to 58mm (32 cols)

        const printer = state.printers.find(p => p.id === printerId)
        if (!printer) return 32

        return PAPER_WIDTH_COLUMNS[printer.paperWidth] as 32 | 48
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist printers and defaultPrinterId, not scanning state
      partialize: (state) => ({
        printers: state.printers,
        defaultPrinterId: state.defaultPrinterId,
      }),
    }
  )
)

// Selector hooks for common use cases
export const useActivePrinter = () => usePrinterStore(state => state.getActivePrinter())
export const usePrinters = () => usePrinterStore(state => state.printers)
export const useDefaultPrinterId = () => usePrinterStore(state => state.defaultPrinterId)
export const useIsScanning = () => usePrinterStore(state => state.isScanning)
export const useDiscoveredDevices = () => usePrinterStore(state => state.discoveredDevices)
