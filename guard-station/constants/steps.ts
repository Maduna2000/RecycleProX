import type { Href } from 'expo-router';
import type { Purpose } from '@/services/gateService';

// Two numbering systems coexist by design (see entryStore.ts's comment on
// its own `step` field):
//  - "internal" step: fixed 1-6 regardless of purpose (3=Category is simply
//    never visited for non-'sell' purposes) — what entryStore persists, so
//    a relaunch can resume at the right screen.
//  - "display" step: the 1-indexed position in the *visible* step list for
//    the current purpose (5 steps for non-sell, 6 for sell) — what each
//    screen renders in its <StepProgressBar>.
// Both need a route list; DISPLAY_ROUTES is what StepProgressBar's tap-to-
// go-back uses, INTERNAL_ROUTES is what the relaunch-resume check in
// app/index.tsx uses.

export const STEP_LABELS_SELL = ['Visitor', 'Purpose', 'Category', 'Vehicle', 'Photos', 'Review'] as const;
export const STEP_LABELS_OTHER = ['Visitor', 'Purpose', 'Vehicle', 'Photos', 'Review'] as const;

const DISPLAY_ROUTES_SELL: Href[] = [
  '/(guard)/step1-visitor',
  '/(guard)/step2-purpose',
  '/(guard)/step3-category',
  '/(guard)/step4-vehicle',
  '/(guard)/step5-photos',
  '/(guard)/step6-review',
];

const DISPLAY_ROUTES_OTHER: Href[] = [
  '/(guard)/step1-visitor',
  '/(guard)/step2-purpose',
  '/(guard)/step4-vehicle',
  '/(guard)/step5-photos',
  '/(guard)/step6-review',
];

export const INTERNAL_STEP_ROUTES: Record<1 | 2 | 3 | 4 | 5 | 6, Href> = {
  1: '/(guard)/step1-visitor',
  2: '/(guard)/step2-purpose',
  3: '/(guard)/step3-category',
  4: '/(guard)/step4-vehicle',
  5: '/(guard)/step5-photos',
  6: '/(guard)/step6-review',
};

export function stepLabelsFor(purpose: Purpose | null): readonly string[] {
  return purpose === 'sell' ? STEP_LABELS_SELL : STEP_LABELS_OTHER;
}

export function stepRoutesFor(purpose: Purpose | null): Href[] {
  return purpose === 'sell' ? DISPLAY_ROUTES_SELL : DISPLAY_ROUTES_OTHER;
}

/** 1-indexed display step -> route, for a given purpose. */
export function routeForDisplayStep(displayStep: number, purpose: Purpose | null): Href {
  const routes = stepRoutesFor(purpose);
  return routes[displayStep - 1] ?? routes[0];
}
