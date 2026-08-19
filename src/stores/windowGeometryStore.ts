import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const STORAGE_KEY = 'renovo-window-geometry'

export interface WindowGeometry {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

interface WindowGeometryState {
  /** Keyed by module identity (module-names.ts's getModuleKey), not the raw
   * URL, so every instance of a dynamic detail route (e.g. any customer's
   * `/app/customers/[id]`) shares one remembered window shape. No entry for
   * a key means that page has never been moved/resized — it renders
   * full-size, identical to before this feature existed. */
  geometries: Record<string, WindowGeometry>
  /** Commits a floating position/size — always sets maximized: false, since
   * dragging/resizing is the user asking for exactly this floating shape. */
  setFloatingGeometry: (key: string, geometry: Omit<WindowGeometry, 'maximized'>) => void
  /** Flips maximized without touching the remembered x/y/width/height
   * underneath, so restoring returns to exactly where the window was left.
   * No-op if there's no entry yet — the page is already at its default
   * (equivalent to maximized) shape with nothing to restore to. */
  toggleMaximized: (key: string) => void
}

export const useWindowGeometryStore = create<WindowGeometryState>()(
  persist(
    (set, get) => ({
      geometries: {},

      setFloatingGeometry: (key, geometry) => {
        set((state) => ({
          geometries: { ...state.geometries, [key]: { ...geometry, maximized: false } },
        }))
      },

      toggleMaximized: (key) => {
        const existing = get().geometries[key]
        if (!existing) return
        set((state) => ({
          geometries: { ...state.geometries, [key]: { ...existing, maximized: !existing.maximized } },
        }))
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
