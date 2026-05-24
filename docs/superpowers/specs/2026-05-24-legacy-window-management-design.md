# Legacy Window Management + AppShell Cosmetic Fixes

**Date:** 2026-05-24  
**Status:** Approved  
**Scope:** AppShell layout polish (Batch A) + legacy desktop-style window management system (Batch B)

---

## Context

Renovo Pro targets a legacy SaaS desktop feel (Java Swing / MDI-style). The current AppShell has three issues that break this identity: (1) window controls (minimize/close) live in the global title bar instead of inside each page, (2) there is no taskbar for tracking and restoring open pages, and (3) several cosmetic inconsistencies (Scale popup clipping, Zone 2 colour gap, footer alignment/version). This spec resolves all of them.

---

## Batch A — Cosmetic Fixes (AppShell.tsx only)

### A1. Scale popup viewport clipping
**Problem:** `ScalePopup` dropdown div uses `left-0` which anchors to the button's left edge. Since the button is in the far-right corner of Zone 2, the 224px-wide popup overflows the right edge of the viewport.  
**Fix:** Change `left-0` → `right-0` on the popup div so it aligns to the button's right edge and grows leftward.

### A2. Zone 2 subtle dark tint
**Problem:** Zone 2 (`#F8F9FA`, neutral light grey) creates a harsh visual jump between Zone 1 (solid navy `#1B3A6B`) and the light content area. The user wants Zone 2 to "blend in" without competing with Zone 1.  
**Fix:** Change Zone 2 background to `rgba(27,58,107,0.09)` — a 9% navy overlay that produces a barely-perceptible blue-grey (`≈ #ECF0F8`). Keeps it light and functional while belonging to the same colour family as Zone 1.

### A3. Zone 4 footer: center alignment + V1.0
**Problem:** Branding text is left-aligned and shows incorrect version number (V3.0).  
**Fix:**
- Remove the `flex-1` spacer div that pushed the module button to the center
- Replace the left-aligned branding `<span>` with a centered, `flex-1` version
- New layout: `[centered branding text]` on left side of flex, time on right
  ```
  Renovo Pro Management Software · V1.0        19:28
  ```
- Exact text: `Renovo Pro Management Software · V1.0`
- Typography: `text-[10px] text-white/50 font-medium tracking-wide`
- Remove the `onMinimize` module-name button (replaced by WindowTaskbar in Batch B)

---

## Batch B — Legacy Window Management System

### B0. Extract MODULE_NAMES to shared file
**Problem:** `MODULE_NAMES` is currently defined inside `AppShell.tsx`. The new `WindowedContent` client component also needs it.  
**Fix:** Move `MODULE_NAMES` and `getModuleName()` to `src/lib/module-names.ts`. Also add `HREF_TO_ICON: Record<string, React.ElementType>` — a map from href to the matching lucide icon (reuses the same icons from the dashboard TILES array). Both `AppShell.tsx` and `WindowedContent.tsx` import from this shared file.

---

### B1. Window Store — `src/stores/windowStore.ts`

Zustand store tracking up to 4 open module pages.

```ts
interface WindowEntry {
  id:    string                // nanoid() — stable per open instance
  href:  string                // pathname e.g. '/app/purchases'
  label: string                // display name e.g. 'Purchases'
  icon:  React.ElementType     // lucide icon component, stored at openWindow time
}

interface WindowStore {
  windows: WindowEntry[]

  openWindow(href: string, label: string, icon: React.ElementType): void
  // - If href already in windows: no-op (avoids duplicate tabs)
  // - If windows.length === 4: removes oldest (windows[0]) before adding
  // - Appends new entry to end

  closeWindow(id: string, navigate: (href: string) => void): void
  // - Removes entry with matching id
  // - Calls navigate() with: left-neighbour href → right-neighbour href → '/app/dashboard'

  clearAll(): void
  // Called on logout/session expiry
}
```

No "minimized" flag needed — a window is "active" when `pathname === win.href` (derived from `usePathname()`). Minimizing simply means navigating away; the tab entry persists.

---

### B2. PageTitleBar — `src/components/ui/PageTitleBar.tsx`

A 28px title bar rendered at the very top of Zone 3 content for every module page.

**Visual spec:**
```
┌────────────────────────────────────────────────────┐  28px
│ Purchases                          [−]  [×]        │
└────────────────────────────────────────────────────┘
  ↑ module name (12px semibold #374151)    ↑ icon buttons
```

- Background: `rgba(27,58,107,0.05)` — barely visible tint
- Bottom border: `1px solid rgba(0,0,0,0.07)`
- Module name: read from `getModuleName(pathname)` via `usePathname()`
- `[−]` **Minimize:** `windowStore.openWindow` is already done; just `router.push` to left-neighbour href OR dashboard. The tab stays in WindowTaskbar.
- `[×]` **Close:** calls `windowStore.closeWindow(id, navigate)` which handles navigation automatically
- Both buttons: `Minus` and `X` icons from lucide-react, 14px, `text-[#6B7280]` with `hover:text-[#374151]` and `hover:bg-black/5` rounded

**Placement:** Rendered by `WindowedContent` (see B3) — appears automatically on all module pages. Not rendered on dashboard.

---

### B3. WindowedContent — `src/components/layout/WindowedContent.tsx`

A `'use client'` component that wraps all `(modules)` children. Responsibilities:
1. Registers the current page in `windowStore` on pathname change
2. Renders `<PageTitleBar />` above the page children

```tsx
'use client'
export function WindowedContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { openWindow } = useWindowStore()

  useEffect(() => {
    const label = getModuleName(pathname)
    if (pathname !== '/app/dashboard') {
      openWindow(pathname, label)
    }
  }, [pathname])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageTitleBar />
      {children}
    </div>
  )
}
```

**Modified file:** `src/app/app/(modules)/layout.tsx` — wrap `{children}` with `<WindowedContent>`.

---

### B4. WindowTaskbar — `src/components/ui/WindowTaskbar.tsx`

A `'use client'` component rendered in AppShell between Zone 3 and Zone 4.

**Visual spec:**
```
┌─────────────────────────────────────────────────────┐ 24px  Zone 4b
│ [📋 Purchases ×]  [🏷 Sales ×]  [📦 Stock ×]        │
└─────────────────────────────────────────────────────┘
```

- **Height:** 24px  
- **Background:** `rgba(27,58,107,0.88)` — slightly lighter than Zone 4 (`rgba(27,58,107,0.95)`)
- **Only renders** when `windows.length > 0`
- **Each tab:**
  - Width: `min-w-[80px] max-w-[140px]`, truncated label with `title` tooltip
  - Small module icon (from lucide-react, matched to TILE icon registry)
  - Label text: `text-[10px] font-medium`
  - `[×]` close button: 10px, appears on hover
  - **Active tab** (when `pathname === win.href`): `bg-white/20 border-t-2 border-t-[#F2AB1A]`
  - **Inactive tab**: `bg-transparent hover:bg-white/10`
- Click tab body → `router.push(win.href)` (activates/restores that page)
- Click `[×]` → `windowStore.closeWindow(win.id, navigate)`

---

### B5. AppShell.tsx changes summary

| Location | Change |
|---|---|
| `ScalePopup` dropdown div | `left-0` → `right-0` |
| Zone 2 background | `#F8F9FA` → `rgba(27,58,107,0.09)` |
| Zone 1 right side | Remove `<WindowControls />` component entirely |
| Between Zone 3 and Zone 4 | Add `<WindowTaskbar />` |
| Zone 4 `Taskbar` component | Center branding text + V1.0; remove module-name button; keep time right |
| `MODULE_NAMES` + `getModuleName` | Remove (now imported from `src/lib/module-names.ts`) |

---

## File Change Summary

| File | Action | Purpose |
|---|---|---|
| `src/lib/module-names.ts` | **CREATE** | Shared MODULE_NAMES map + getModuleName() + HREF_TO_ICON map |
| `src/stores/windowStore.ts` | **CREATE** | Zustand window management state |
| `src/components/ui/PageTitleBar.tsx` | **CREATE** | Per-page title bar with [−][×] |
| `src/components/ui/WindowTaskbar.tsx` | **CREATE** | Zone 4b open-windows tab strip |
| `src/components/layout/WindowedContent.tsx` | **CREATE** | Client wrapper for modules layout |
| `src/components/layout/AppShell.tsx` | **MODIFY** | A1–A3 fixes + B5 changes |
| `src/app/app/(modules)/layout.tsx` | **MODIFY** | Wrap children with WindowedContent |

---

## UX/UI Standards Applied

- `navigation-consistency` — one title bar per page, one taskbar, no duplicate controls
- `avoid-mixed-patterns` — window controls live in page body (legacy MDI), not global chrome
- `visual-hierarchy` — Zone colour gradient: navy (Z1) → tinted grey (Z2) → light content (Z3) → dark taskbars (Z4)
- `touch-target-size` — [−][×] buttons in PageTitleBar: 28×28px hit area
- `nav-state-active` — active tab in WindowTaskbar: amber top border + white/20 bg
- `back-behavior` — close/minimize always lands on a predictable adjacent page or dashboard
- `number-tabular` — clock in Zone 4 uses `font-mono tabular-nums`

---

## Verification Checklist

1. Dashboard opens → no PageTitleBar visible, no WindowTaskbar (zero tabs)
2. Click "Purchases" tile → PageTitleBar shows "Purchases" with [−][×]; WindowTaskbar appears with one tab
3. Navigate to Sales → WindowTaskbar shows [Purchases][Sales]; both tabs clickable
4. Click [−] on Purchases page → navigates to Sales; Purchases tab remains in taskbar
5. Click Purchases tab in taskbar → restores Purchases page; tab highlights
6. Click [×] on Sales tab in taskbar → Sales removed; navigates to Purchases
7. Open 4 pages; open a 5th → oldest tab auto-closes (only 4 shown)
8. Close last tab → lands on Dashboard; WindowTaskbar disappears
9. Scale popup → opens leftward, fully within viewport
10. Zone 2 on dashboard → subtle blue-grey tint, no harsh white jump from Zone 1
11. Zone 4 → "Renovo Pro Management Software · V1.0" centered; time right-aligned
12. Zone 1 → no minimize/close buttons in header
