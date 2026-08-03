import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { Purpose } from '@/services/gateService';

export type VisitorInfo = {
  firstName: string;
  lastName: string;
  idNumber: string;
  phone?: string;
  /** Matched an existing account-type Customer by exact ID number — see step1-visitor.tsx. */
  isAccountHolder: boolean;
};

export type PhotoKeys = {
  idPhotoR2Key?: string;
  vehiclePhotoR2Key?: string;
};

// Internal step numbers stay fixed regardless of purpose (3 = Category, 4 =
// Vehicle, 5 = Photos, 6 = Review) — mirrors gate/page.tsx's comment on the
// web: for non-"sell" purposes step 3 is just never visited.
type Step = 1 | 2 | 3 | 4 | 5 | 6;

type EntryState = {
  visitor: VisitorInfo | null;
  purpose: Purpose | null;
  categoryNames: string[];
  vehicleReg: string;
  requireIdPhoto: boolean;
  requireVehiclePhoto: boolean;
  photoKeys: PhotoKeys;
  photoExemptionNote: string | undefined;
  vehicleExempt: boolean | undefined;
  /** Client-generated, reused as the referenceId for both photo uploads on this entry — see step5-photos.tsx. */
  tempId: string;
  step: Step;
  submittedEntryNumber: string | null;
  submittedQueueNumber: number | null;
  /** Set on every mutation — used to discard a stale in-progress entry on relaunch, see WIP_MAX_AGE_MS. */
  savedAt: number;
};

// A real Android tablet can have this app's process killed under memory
// pressure at any time (backgrounded, another app hogging RAM) — this is
// normal OS behavior, not something a true native app avoids just by not
// being a WebView. photoKeys only ever holds already-uploaded R2 key
// strings, so the in-progress entry is safely persistable — mirrors
// gate/page.tsx's identical WIP_STORAGE_KEY/WIP_MAX_AGE_MS reasoning on the
// web, so a guard mid-entry never loses their place to a relaunch.
const WIP_MAX_AGE_MS = 4 * 60 * 60 * 1000;

type EntryActions = {
  setVisitor: (visitor: VisitorInfo) => void;
  setPurpose: (purpose: Purpose, photoConfig: { requireIdPhoto: boolean; requireVehiclePhoto: boolean }) => void;
  setCategoryNames: (names: string[]) => void;
  setVehicleReg: (reg: string) => void;
  setPhotoKeys: (keys: PhotoKeys, exemptionNote?: string, vehicleExempt?: boolean) => void;
  goToStep: (step: Step) => void;
  goBack: () => void;
  setSubmitted: (entryNumber: string, queueNumber: number | null) => void;
  reset: () => void;
};

function freshState(): EntryState {
  return {
    visitor: null,
    purpose: null,
    categoryNames: [],
    vehicleReg: '',
    requireIdPhoto: false,
    requireVehiclePhoto: true,
    photoKeys: {},
    photoExemptionNote: undefined,
    vehicleExempt: undefined,
    tempId: Crypto.randomUUID(),
    step: 1,
    submittedEntryNumber: null,
    submittedQueueNumber: null,
    savedAt: Date.now(),
  };
}

export const useEntryStore = create<EntryState & EntryActions>()(
  persist(
    (set, get) => ({
      ...freshState(),

      setVisitor: (visitor) => set({ visitor, step: 2, savedAt: Date.now() }),

      setPurpose: (purpose, photoConfig) =>
        set({
          purpose,
          requireIdPhoto: photoConfig.requireIdPhoto,
          requireVehiclePhoto: photoConfig.requireVehiclePhoto,
          step: purpose === 'sell' ? 3 : 4,
          savedAt: Date.now(),
        }),

      setCategoryNames: (categoryNames) => set({ categoryNames, step: 4, savedAt: Date.now() }),

      setVehicleReg: (vehicleReg) => set({ vehicleReg, step: 5, savedAt: Date.now() }),

      setPhotoKeys: (photoKeys, photoExemptionNote, vehicleExempt) =>
        set({ photoKeys, photoExemptionNote, vehicleExempt, step: 6, savedAt: Date.now() }),

      goToStep: (step) => set({ step, savedAt: Date.now() }),

      goBack: () => {
        const { step, purpose } = get();
        if (step <= 1) return;
        if (step === 4 && purpose !== 'sell') set({ step: 2, savedAt: Date.now() });
        else set({ step: (step - 1) as Step, savedAt: Date.now() });
      },

      setSubmitted: (submittedEntryNumber, submittedQueueNumber) =>
        set({ submittedEntryNumber, submittedQueueNumber, savedAt: Date.now() }),

      reset: () => set(freshState()),
    }),
    {
      name: 'guardstation-entry-wip',
      storage: createJSONStorage(() => AsyncStorage),
      // A stale in-progress entry (older than a shift-length window, or one
      // that already made it to the success screen) is presumed abandoned —
      // start the next guard session clean rather than resuming it.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const stale = Date.now() - state.savedAt > WIP_MAX_AGE_MS;
        if (stale || state.submittedEntryNumber) state.reset();
      },
    }
  )
);
