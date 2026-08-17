import { create } from 'zustand'
import type { ReactNode } from 'react'

/**
 * Lets an individual page inject custom controls (a live status, a Refresh
 * button, etc.) into the shared, layout-level PageTitleBar — which renders
 * outside the page component (in WindowedContent) and so has no props slot
 * of its own for page-specific content. A page sets this via
 * useTitleBarActions (see hooks/useTitleBarActions.ts) and it's cleared
 * automatically on unmount/navigation so it never bleeds into another page.
 */
interface TitleBarActionsStore {
  actions: ReactNode | null
  setActions(actions: ReactNode | null): void
}

export const useTitleBarActionsStore = create<TitleBarActionsStore>()((set) => ({
  actions: null,
  setActions(actions) {
    set({ actions })
  },
}))
