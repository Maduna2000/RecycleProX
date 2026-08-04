import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, CustomerSearchResult } from '@/services/scaleService';

export type CasualCustomer = {
  type: 'casual';
  firstName: string;
  lastName: string;
  phone?: string;
};

export type AccountCustomer = {
  type: 'account';
  customerId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  companyName?: string;
};

export type OrderCustomer = CasualCustomer | AccountCustomer;

export type OrderLine = {
  product: Product;
  weight: number;
  photoR2Keys: string[];
  localPhotoUris: string[];
};

type OrderState = {
  customer: OrderCustomer | null;
  lines: OrderLine[];
  currentProduct: Product | null;
  currentWeight: number;
  currentPhotoUris: string[];
  currentPhotoR2Keys: string[];
  step: 1 | 2 | 3 | 4 | 5 | 6;
  submittedOrderId: string | null;
  submittedOrderNumber: string | null;
  /** Set on every mutation — used to discard a stale in-progress order on relaunch, see WIP_MAX_AGE_MS. */
  savedAt: number;
};

// A real Android tablet's app process can get killed at any time (network
// drop triggering the ErrorBoundary's remount, backgrounding, memory
// pressure) — that used to wipe an in-progress order entirely, forcing the
// operator to redo customer/product/weight/photos from scratch. Persisting
// to AsyncStorage means that data survives a remount; the staleness check
// mirrors guard-station's identical WIP_MAX_AGE_MS reasoning so a genuinely
// abandoned order doesn't linger into the next shift.
const WIP_MAX_AGE_MS = 4 * 60 * 60 * 1000;

type OrderActions = {
  setCustomer: (customer: OrderCustomer) => void;
  setProduct: (product: Product) => void;
  setWeight: (weight: number) => void;
  addPhoto: (uri: string, r2Key: string) => void;
  removePhoto: (index: number) => void;
  confirmLine: () => void;
  addAnotherLine: () => void;
  goToStep: (step: OrderState['step']) => void;
  setSubmittedOrder: (id: string, orderNumber: string) => void;
  reset: () => void;
};

function freshState(): OrderState {
  return {
    customer: null,
    lines: [],
    currentProduct: null,
    currentWeight: 0,
    currentPhotoUris: [],
    currentPhotoR2Keys: [],
    step: 1,
    submittedOrderId: null,
    submittedOrderNumber: null,
    savedAt: Date.now(),
  };
}

export const useOrderStore = create<OrderState & OrderActions>()(
  persist(
    (set, get) => ({
      ...freshState(),

      setCustomer: (customer) => set({ customer, step: 2, savedAt: Date.now() }),

      setProduct: (product) => set({ currentProduct: product, step: 3, savedAt: Date.now() }),

      setWeight: (weight) => set({ currentWeight: weight, step: 4, savedAt: Date.now() }),

      addPhoto: (uri, r2Key) =>
        set((s) => ({
          currentPhotoUris: [...s.currentPhotoUris, uri],
          currentPhotoR2Keys: [...s.currentPhotoR2Keys, r2Key],
          savedAt: Date.now(),
        })),

      removePhoto: (index) =>
        set((s) => ({
          currentPhotoUris: s.currentPhotoUris.filter((_, i) => i !== index),
          currentPhotoR2Keys: s.currentPhotoR2Keys.filter((_, i) => i !== index),
          savedAt: Date.now(),
        })),

      confirmLine: () => {
        const { currentProduct, currentWeight, currentPhotoUris, currentPhotoR2Keys, lines } = get();
        if (!currentProduct) return;
        const newLine: OrderLine = {
          product: currentProduct,
          weight: currentWeight,
          photoR2Keys: currentPhotoR2Keys,
          localPhotoUris: currentPhotoUris,
        };
        set({
          lines: [...lines, newLine],
          currentProduct: null,
          currentWeight: 0,
          currentPhotoUris: [],
          currentPhotoR2Keys: [],
          step: 5,
          savedAt: Date.now(),
        });
      },

      addAnotherLine: () =>
        set({
          currentProduct: null,
          currentWeight: 0,
          currentPhotoUris: [],
          currentPhotoR2Keys: [],
          step: 2,
          savedAt: Date.now(),
        }),

      goToStep: (step) => set({ step, savedAt: Date.now() }),

      setSubmittedOrder: (id, orderNumber) =>
        set({ submittedOrderId: id, submittedOrderNumber: orderNumber, savedAt: Date.now() }),

      reset: () => set(freshState()),
    }),
    {
      name: 'scalestation-order-wip',
      storage: createJSONStorage(() => AsyncStorage),
      // A stale in-progress order (older than a shift-length window, or one
      // that already made it to the success screen) is presumed abandoned —
      // start the next operator session clean rather than resuming it.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const stale = Date.now() - state.savedAt > WIP_MAX_AGE_MS;
        if (stale || state.submittedOrderId) state.reset();
      },
    }
  )
);
