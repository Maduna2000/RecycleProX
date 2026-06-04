import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'scale_thermal_printer_address';

type PrinterState = {
  printerAddress: string | null;
  isLoaded: boolean;
};

type PrinterActions = {
  loadSavedAddress: () => Promise<void>;
  savePrinterAddress: (address: string) => Promise<void>;
  clearPrinterAddress: () => Promise<void>;
};

export const usePrinterStore = create<PrinterState & PrinterActions>((set) => ({
  printerAddress: null,
  isLoaded: false,

  loadSavedAddress: async () => {
    try {
      const address = await AsyncStorage.getItem(STORAGE_KEY);
      set({ printerAddress: address, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  savePrinterAddress: async (address: string) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, address);
      set({ printerAddress: address });
    } catch { /* ignore */ }
  },

  clearPrinterAddress: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      set({ printerAddress: null });
    } catch { /* ignore */ }
  },
}));
