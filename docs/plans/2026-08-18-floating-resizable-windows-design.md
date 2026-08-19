# Floating, Movable, Resizable Page Windows (MT4-style)

**Date:** 2026-08-18
**Status:** Approved
**Scope:** Every module page (Dashboard excluded), building on this session's MT4/Win32 window-chrome pass.

---

## Context

The app already simulates a legacy MDI desktop (`PageTitleBar` + `WindowTaskbar`, see `docs/superpowers/specs/2026-05-24-legacy-window-management-design.md` and this session's window-chrome pass), but every page is always docked full-size within Zone 3 of `AppShell.tsx` — no drag, no resize, no maximize/restore.

**Confirmed scope**: one floating window at a time, not true overlapping multi-window MDI. The app still shows one page at a time (Next.js routing, the taskbar switches which page is visible) — this feature makes *that* page's window draggable and resizable within its content area, not multiple simultaneously-visible overlapping windows. A page's default appearance is unchanged (full current width) until the user actively drags or resizes it, and that custom geometry is then remembered per page across sessions.

---

## 1. Data model + persistence

New store, `src/stores/windowGeometryStore.ts` — separate from the existing `windowStore.ts` (which tracks the taskbar's open-page list and is intentionally session-only; geometry needs to outlive a closed taskbar entry).

```ts
interface WindowGeometry {
  x: number; y: number
  width: number; height: number
  maximized: boolean
}
```

- Uses `zustand/middleware`'s `persist` to localStorage.
- Keyed by **module identity** (regex-matched pathname pattern, same convention `pageWidthCaps.ts` already uses), not the raw URL — so `/app/customers/[id]` for any customer shares one remembered geometry rather than every individual record getting its own untouched default.
- No stored entry (or `maximized: true`) renders pixel-identical to today — full width/height of the content area. Every page effectively starts maximized; it only diverges once the user actively moves or resizes it.

## 2. Drag & resize mechanics

- **Move**: mousedown on the title bar (excluding the `[−][□][×]` controls) starts a drag; `mousemove`/`mouseup` attach to `window` for the gesture's duration. Position updates in local component state during the drag (smooth, no store thrashing); final x/y commits to the store on mouseup. Dragging a maximized window's title bar restores it to its last floating geometry first, then follows the cursor.
- **Resize**: 8 invisible ~6-8px drag strips (4 edges + 4 corners) around the window's full perimeter, each with the matching cursor. Corner handles resize both dimensions; edge handles resize one. Dragging the west/north edge adjusts position and size together; east/south only change width/height. A resize clamps at the content area's own edges — dragging to an edge reaches full-screen without needing the maximize button. Minimum size floor: 560×360.
- **Maximize control**: new `[□]` button joins `[−]`/`[×]` (Win32 order: minimize, maximize, close). Toggles the `maximized` flag; the last floating geometry stays remembered underneath, so restoring (button or title-bar double-click, same toggle) returns to exactly where you left it.

## 3. Layout integration

- Zone 3's content area (`<main className="rpx-content ...">` in `AppShell.tsx`) becomes the `position: relative` anchor.
- `WindowedContent` changes from stacking `<PageTitleBar />` above `{children}` in normal flow to rendering both together as one `position: absolute` unit, sized/positioned from the geometry store. Resize handles run along the whole perimeter of that combined unit (title bar included).
- Convergence with the existing width-cap system: pages already registered in `pageWidthCaps.ts` (customer detail, Police Register, Cash-Up, Products, etc.) now use that cap as the window's **default floating width** directly, instead of centering capped content inside a full-bleed page — same first-load appearance, cleaner fit with the geometry model. Uncapped pages keep defaulting to full content-area width.
- Pages using `PortalPage`'s folder-tab row (Police Register, Expenses, Gate, Photos, Scale) are unaffected beyond floating/resizing like everything else — the tab-to-content seam inside the window stays as-is.
- When not maximized, the margin around the window shows Zone 3's existing background — no new backdrop styling needed.

## 4. Scope, edge cases & verification

- Dashboard excluded (no `PageTitleBar`, unaffected — same as the rest of this session's chrome work).
- **Small viewports** (roughly <900-1000px wide — a narrow browser window or tablet portrait): windows render maximized-only, drag/resize disabled, saved custom geometry ignored until the viewport widens again.
- **App/viewport resize**: stored geometry clamps for rendering only if it would put the window off-screen — the saved preference itself isn't overwritten, so it reappears once the window grows back.

**Verification**: drag by the title bar and confirm it moves/stays grabbable within bounds; resize from each of the 8 handles, confirm the minimum-size floor; maximize via button and via title-bar double-click, then restore, confirm exact prior geometry returns; reload and navigate away/back, confirm persistence; confirm a `pageWidthCaps`-registered page opens at its registered width by default; confirm Dashboard and small-viewport behavior unaffected; `npx tsc --noEmit` clean.
