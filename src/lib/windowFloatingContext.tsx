'use client'

/**
 * Whether the enclosing FloatingWindowFrame is currently a user-resized
 * floating shape (not the default/maximized state). PortalPage
 * (rpx/primitives.tsx) reads this to decide whether its own `maxWidth`
 * prop should still apply — pageWidthCaps.ts's registered width is only
 * meant to be the window's *default* size; once the user has explicitly
 * dragged/resized the window wider, PortalPage's own inner cap would
 * otherwise keep the table/content stuck at its original width while only
 * the window's border moved.
 *
 * Lives in its own dependency-free file (not inside FloatingWindowFrame.tsx
 * itself) specifically to avoid a circular import: primitives.tsx would
 * otherwise need to import from FloatingWindowFrame.tsx, which imports
 * PageTitleBar, which imports from @/components/rpx (index.ts), which
 * re-exports primitives.tsx.
 *
 * False (the safe default) outside a FloatingWindowFrame — the standalone
 * apps (police, scale, gate, ledger) don't use this system and keep their
 * pages' own width caps unconditionally.
 */
import { createContext, useContext } from 'react'

export const WindowFloatingContext = createContext(false)

export function useIsWindowFloating(): boolean {
  return useContext(WindowFloatingContext)
}
