'use client'

import { createContext, useContext } from 'react'

interface PrinterContextValue {
  openPrinterSetup: () => void
}

export const PrinterContext = createContext<PrinterContextValue>({
  openPrinterSetup: () => {},
})

export function usePrinterSetup() {
  return useContext(PrinterContext)
}
