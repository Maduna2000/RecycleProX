---
name: recycleprox-portal
description: Spec for building the Portal module in RecycleProX Basic.
  Read this when asked to build, fix, or validate the Portal / home screen / launcher.
---

# Module: Portal (Home Screen / Launcher)

## What This Module IS

The Portal is the first screen a user sees after logging in.
It is a shortcut tile launcher — a grid of large clickable tiles,
one per module. Think of it like a Windows Start screen or an app
launcher, NOT a dashboard with charts and KPI cards.

Every day, a cashier opens RecycleProX, logs in, sees the Portal,
and clicks "Purchases" to start their day. The Portal also shows
live scale readings so the cashier can see weights without opening
the Purchase screen.

## Source of Truth

- BASIC-BRO.pdf Page 3, Section 1 "Portal"
- Screenshot: Windows MDI interface showing icon grid + two scale readings
  top-right + RecycleProX logo centred at bottom

---

## Workflow

1. User logs in with username + password
2. Portal opens immediately — full screen, navy background
3. Portal shows a grid of module tiles — one per accessible module
4. Top-right corner shows live scale readings (Scale 1, Scale 2)
5. Status bar at very bottom shows: version, username, role, date, time
6. User clicks a tile → that module opens and a tab appears in the tab bar
7. User can open multiple modules — each becomes a tab
8. Clicking the "Portal" tab returns to this launcher
9. User can customise which tiles appear via "Customise Portal" button
10. Each tile is visible to all roles but dimmed if the user lacks access

---

## UI Components Required

### 1. PortalGrid — custom component

**File:** `src/components/portal/PortalGrid.tsx`

Renders the full-screen tile grid on the navy background.

**Layout:**
- Full viewport height minus tab bar (top) and status bar (bottom)
- Content centred both vertically and horizontally
- CSS grid: `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))`
- Max content width: 900px (so tiles don't stretch on wide monitors)
- Gap between tiles: 16px

**Background:** `#1B3A6B` (primary navy)

**All 16 tiles (in this order):**
```
Row 1: Accounts | Purchases | Sales | Payments
Row 2: Cash-Up  | Expenses  | Float | Casual Details
Row 3: Unpaid Purchases | Stock Level Grid | Photo Viewer | Police Register
Row 4: Loans | Pricing | Reports | Settings
```

**Role gating:**
```
cashier can access:    Accounts, Purchases, Sales, Casual Details, Stock Level Grid, Photo Viewer
manager can access:    + Payments, Cash-Up, Expenses, Float, Unpaid Purchases, Police Register, Loans, Reports
admin can access:      + Pricing, Settings
```

Tiles the user CANNOT access: still visible, opacity 0.35.
Tiles the user CAN access: full opacity.

### 2. ModuleTile — custom component

**File:** `src/components/portal/ModuleTile.tsx`

```ts
interface ModuleTileProps {
  label:      string
  icon:       LucideIcon
  href:       string         // route to navigate to
  accessible: boolean        // based on role
  isActive?:  boolean        // true if this module tab is open
}
```

**Visual spec:**
```
Size:             160px × 140px
Background:       rgba(255, 255, 255, 0.08)
Border:           1px solid rgba(255, 255, 255, 0.15)
Border radius:    12px
Cursor:           pointer (if accessible) | not-allowed (if not)

Icon:             40×40px, white, centred, top 40% of tile
Label:            13px, white, font-weight 500, centred, bottom 35%

Hover (accessible):
  Background:     rgba(255, 255, 255, 0.18)
  Transform:      scale(1.04)
  Transition:     150ms ease

Active (module tab is open):
  Border-bottom:  3px solid #F2AB1A (amber)

Inaccessible:
  Opacity:        0.35
  No hover effect
```

**Click behaviour:**
- If accessible: navigate to `href`, open module tab
- If not accessible: show toast "Your role does not have access to this module"

**Icon mapping:**
```ts
const TILE_ICONS: Record<string, LucideIcon> = {
  'Accounts':          Users,
  'Purchases':         ShoppingCart,
  'Sales':             TrendingUp,
  'Payments':          DollarSign,
  'Cash-Up':           Calculator,
  'Expenses':          Receipt,
  'Float':             Wallet,
  'Casual Details':    UserCheck,
  'Unpaid Purchases':  Clock,
  'Stock Level Grid':  BarChart2,
  'Photo Viewer':      Camera,
  'Police Register':   Shield,
  'Loans':             Landmark,
  'Pricing':           Tag,
  'Reports':           FileText,
  'Settings':          Settings,
}
```

### 3. ScaleReadingPanel — custom component

**File:** `src/components/portal/ScaleReadingPanel.tsx`

**Position:** Top-right of the portal screen, absolute positioned.

**Shows:** One row per configured scale (where SCALE_N_TYPE !== 'none').

**Each scale row:**
```
Scale 1:  ● 23.450 kg    (green dot = connected)
Scale 2:  ○ ---          (grey dot = not connected / not configured)
```

**Visual spec:**
```
Background:   rgba(0, 0, 0, 0.35)
Border:       1px solid rgba(255,255,255,0.15)
Border radius: 8px
Padding:      12px 16px
Min width:    180px

Scale label:  11px, rgba(255,255,255,0.6)
Weight value: 16px, white, font-family monospace, font-weight 600
Status dot:   8px circle, green (#22c55e) connected / red (#ef4444) error / grey disconnected
```

**Behaviour:**
- Polls `GET /api/scales/{n}/read` every 1000ms for each configured scale
- On success: show weight to 3 decimal places, green dot
- On error / timeout: show `---`, red dot
- If scale not configured (type = 'none'): do not render that row at all
- Shows "last updated X seconds ago" if reading is stale > 5s

### 4. ModuleTabBar — custom component

**File:** `src/components/portal/ModuleTabBar.tsx`

**Position:** Below the main nav bar, above the portal content.
**Height:** 32px
**Background:** `#0F2040` (darker navy)

**Tabs:**
- First tab always: "Portal" (cannot be closed)
- Additional tabs: one per open module
- Each tab: module name + × close button (except Portal)
- Active tab: white background, `#1B3A6B` text, bold
- Inactive tab: transparent background, rgba(255,255,255,0.5) text

**Behaviour (Zustand store `src/stores/tabStore.ts`):**
```ts
interface TabStore {
  tabs:          Tab[]
  activeTabId:   string
  openTab:       (tab: Tab) => void     // adds if new, activates if exists
  closeTab:      (id: string) => void   // removes tab, activates Portal
  setActiveTab:  (id: string) => void
}

interface Tab {
  id:    string   // unique, e.g. 'purchases'
  label: string   // display name, e.g. 'Purchases'
  href:  string   // route, e.g. '/app/purchases'
}
```

Opening a tile: calls `tabStore.openTab()` + `router.push(href)`
Closing a tab: calls `tabStore.closeTab()` + `router.push('/app/portal')` if was active
Portal tab click: `router.push('/app/portal')` + `tabStore.setActiveTab('portal')`

### 5. PortalStatusBar — custom component

**File:** `src/components/portal/PortalStatusBar.tsx`

**Position:** Fixed to very bottom of screen, full width, always visible.
**Height:** 24px
**Background:** `#0A1628`
**Z-index:** 100

**Content (left to right):**
```
RecycleProX Basic v{version}  |  {username} ({role})  |  {date YYYY/MM/DD}  {time HH:MM:SS}   CAPS  NUM
```

- Version: read from `package.json` at build time
- Username + role: from NextAuth session
- Date + time: updated every second with `setInterval`
- CAPS/NUM: listen to `keydown` events for `CapsLock` and `NumLock` state
  - Active: bright white text
  - Inactive: `rgba(255,255,255,0.25)` text

**Font:** 11px monospace, `rgba(255,255,255,0.6)`

### 6. CustomisePortalModal — custom component

**File:** `src/components/portal/CustomisePortalModal.tsx`

Opens when user clicks the "Customise Portal" cog icon.

**Shows:** Checkbox list of all modules the user's role can access.
**Saves:** `PATCH /api/users/{id}/portal-preferences` with `{ visibleModules: string[] }`
**Storage:** `User.portalModules String[]` in Prisma

Default for new user: all role-accessible modules visible.
After save: modal closes, grid updates immediately (optimistic update).

---

## API Routes Required

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/scales/1/read | any | Read Scale 1 live weight |
| GET | /api/scales/2/read | any | Read Scale 2 live weight |
| GET | /api/scales/3/read | any | Read Scale 3 live weight |
| PATCH | /api/users/[id]/portal-preferences | self | Save tile visibility |

**Scale route response:**
```ts
// Success
{ weight: '23.450', unit: 'kg', scaleNumber: 1, readAt: ISO_string }

// Scale not connected / timeout
{ error: 'Scale not responding', scaleNumber: 1 }
// HTTP 503

// Scale not configured
{ error: 'Scale not configured', scaleNumber: 1 }
// HTTP 400
```

---

## Service Functions Required

**File:** `src/lib/services/scaleService.ts`

```ts
readScale(n: 1 | 2 | 3): Promise<Decimal>
  // Connect to scale via TCP or serial (from SystemSettings)
  // Timeout: 3000ms
  // Retry: 2 attempts
  // Return Decimal — NEVER float

isScaleConfigured(n: 1 | 2 | 3): Promise<boolean>
  // Check SCALE_N_TYPE in SystemSettings !== 'none'
```

---

## Database Schema

```prisma
// Add to User model:
portalModules  String[]  @default([])
// Stores which module tiles the user has chosen to show
// Empty array = show all accessible modules (default behaviour)
```

Run: `npx prisma migrate dev --name add-user-portal-modules`

---

## Build Order (Vertical Slices)

**Slice 1 — Static portal grid (no data):**
1. Create `PortalGrid.tsx` with hardcoded tiles
2. Create `ModuleTile.tsx` with correct visual spec
3. Create `/app/portal/page.tsx` using PortalGrid
4. Verify in browser: tiles grid shows on navy background ← STOP, CHECK
5. Verify: inaccessible tiles are dimmed (test with cashier session)
6. Verify: clicking accessible tile navigates to that route

**Slice 2 — Tab bar:**
1. Create `src/stores/tabStore.ts` (Zustand)
2. Create `ModuleTabBar.tsx`
3. Wire tile clicks to openTab + navigation
4. Verify: clicking "Purchases" tile adds "Purchases" tab ← STOP, CHECK
5. Verify: clicking × on tab closes it and returns to Portal
6. Verify: clicking same tile twice doesn't duplicate the tab

**Slice 3 — Scale readings:**
1. Confirm scale service reads from SystemSettings
2. Create `GET /api/scales/[n]/read` route
3. Create `ScaleReadingPanel.tsx` polling every 1000ms
4. Verify: panel shows on portal top-right ← STOP, CHECK
5. Verify: when scale not configured, that row is hidden
6. Verify: when API returns 503, shows red dot and '---'

**Slice 4 — Status bar:**
1. Create `PortalStatusBar.tsx`
2. Read version from package.json via env or build-time constant
3. Read user from session
4. Verify: status bar shows at bottom with live clock ← STOP, CHECK

**Slice 5 — Customise portal:**
1. Add `portalModules` to User schema + migrate
2. Create `PATCH /api/users/[id]/portal-preferences`
3. Create `CustomisePortalModal.tsx`
4. Wire cog button → modal → save → grid updates
5. Verify: hiding a tile removes it from grid ← STOP, CHECK
6. Verify: preference persists after page reload

---

## Validation Checklist

Run every item. Module is NOT done until all pass.

### Layout and appearance
- [ ] Portal background is navy `#1B3A6B` — not white, not grey
- [ ] Tiles are in a responsive grid, max 900px wide, centred
- [ ] All 16 tiles are present with correct labels and icons
- [ ] Inaccessible tiles visible but at opacity 0.35 — NOT hidden
- [ ] No sidebar visible anywhere
- [ ] No KPI cards, no charts, no recent activity table

### Tile interactions
- [ ] Hovering an accessible tile shows scale(1.04) + brighter background
- [ ] Clicking accessible tile navigates to correct route
- [ ] Clicking inaccessible tile shows toast "Your role does not have access..."
- [ ] Active module (tab is open) has amber bottom border on its tile

### Tab bar
- [ ] "Portal" tab always present and cannot be closed
- [ ] Opening a module adds its tab
- [ ] Opening same module twice does NOT add duplicate tab
- [ ] Clicking a tab navigates to that module
- [ ] Closing a tab removes it from the bar
- [ ] Closing active tab returns focus to Portal tab
- [ ] Tab state persists if you navigate away and come back

### Scale readings
- [ ] ScaleReadingPanel visible top-right of portal
- [ ] Panel only shows rows for configured scales
- [ ] Unconfigured scales (type=none) show no row at all
- [ ] Connected scale shows weight with 3 decimal places + green dot
- [ ] Disconnected/error scale shows '---' + red dot
- [ ] Readings update every ~1 second (check Network tab — polling calls visible)

### Status bar
- [ ] Status bar visible at very bottom of screen at all times
- [ ] Shows version number from package.json
- [ ] Shows current user name and role
- [ ] Shows current date in YYYY/MM/DD format
- [ ] Shows current time updating every second (HH:MM:SS)
- [ ] CAPS indicator bright when Caps Lock is on
- [ ] NUM indicator bright when Num Lock is on

### Customise portal
- [ ] Cog button visible (top-left or top-right of grid area)
- [ ] Clicking it opens a modal with checkboxes
- [ ] Modal only shows modules the user's role can access
- [ ] Unchecking a module hides its tile immediately
- [ ] Preferences saved to DB (verify in Prisma Studio)
- [ ] Preference persists after page reload

### API security
- [ ] GET /api/scales/1/read without session → 401
- [ ] PATCH /api/users/[id]/portal-preferences without session → 401
- [ ] PATCH /api/users/[other-id]/portal-preferences as that user → 403

### Code quality
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] No console.log — only pino logger
- [ ] Zustand store in `src/stores/tabStore.ts` (not inline state)
- [ ] Scale service reads config from SystemSettings (not hardcoded IPs)
