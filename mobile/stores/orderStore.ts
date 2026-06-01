import { create } from 'zustand';
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
};

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

const initialState: OrderState = {
  customer: null,
  lines: [],
  currentProduct: null,
  currentWeight: 0,
  currentPhotoUris: [],
  currentPhotoR2Keys: [],
  step: 1,
  submittedOrderId: null,
  submittedOrderNumber: null,
};

export const useOrderStore = create<OrderState & OrderActions>((set, get) => ({
  ...initialState,

  setCustomer: (customer) => set({ customer, step: 2 }),

  setProduct: (product) => set({ currentProduct: product, step: 3 }),

  setWeight: (weight) => set({ currentWeight: weight, step: 4 }),

  addPhoto: (uri, r2Key) =>
    set((s) => ({
      currentPhotoUris: [...s.currentPhotoUris, uri],
      currentPhotoR2Keys: [...s.currentPhotoR2Keys, r2Key],
    })),

  removePhoto: (index) =>
    set((s) => ({
      currentPhotoUris: s.currentPhotoUris.filter((_, i) => i !== index),
      currentPhotoR2Keys: s.currentPhotoR2Keys.filter((_, i) => i !== index),
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
    });
  },

  addAnotherLine: () =>
    set({ currentProduct: null, currentWeight: 0, currentPhotoUris: [], currentPhotoR2Keys: [], step: 2 }),

  goToStep: (step) => set({ step }),

  setSubmittedOrder: (id, orderNumber) => set({ submittedOrderId: id, submittedOrderNumber: orderNumber }),

  reset: () => set(initialState),
}));
