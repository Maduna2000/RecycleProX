# Renovo Pro — Redesign Implementation Plan

Companion to [`REDESIGN.md`](./REDESIGN.md). That document said *what's* wrong and *why*; this one says exactly how to fix each item without touching the business logic underneath, based on a full read-through of the actual state management, auth, and API contracts involved. Ordered lowest-risk to highest-risk — implement and verify each one before moving to the next.

**Ground rule for all five items:** every change here is a *wrapper*/*chrome* swap. Submit handlers, API calls, validation, redirect logic, role-gating, and state shape are not touched unless explicitly called out. Where a page's own logic must change (the Cancel button, which is genuinely new behavior), that's isolated to its own section below with the exact risk called out.

---

## 1. Dashboard — glossy Aero restyle (lowest risk)

**Scope, per your correction:** keep the existing 4×4 tile grid, the tile registry, every href, and the disabled/"coming soon" logic exactly as-is. Only the tile's visual treatment changes — from the current flat `bg-gradient-to-br` + `hover:scale-[1.02]` (Win10 Start-tile feel) to a genuine Win7 glossy look.

**What changes, concretely, in `src/app/app/(portal)/dashboard/page.tsx`:**
- Replace the diagonal `bg-gradient-to-br` fill with a vertical 3-stop gradient per group (dark base → mid → a brighter band in the top ~40%), using the *existing* `rpx.{group}` / `rpx.{group}-light` / `rpx.{group}-hover` hex values already in `tailwind.config.ts` — no new colors needed, just a different gradient shape.
- Add a glass highlight: a semi-transparent white gradient overlay (`rgba(255,255,255,0.35)` fading to transparent) across the top ~45% of the tile, sitting above the color gradient — this is the actual "glossy" cue.
- Add an inner bevel via `box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.15)` (top inner highlight, bottom inner shadow) matching the same bevel recipe already added to `Btn`/`ui/button.tsx` in the earlier batches — reuses an established pattern rather than inventing a new one.
- Replace `hover:scale-[1.02]`/`active:scale-[0.97] active:brightness-95` (a spring/scale interaction — explicitly a "modern," non-Win7 motion pattern per the audit) with a glow-on-hover: brighten the glass highlight and/or add a soft outer `box-shadow` glow in the tile's accent color, no transform. This matches "Win7 motion is minimal — fades and glows, no springs" from the audit brief.
- The disabled ("Weighbridge") tile's `opacity-30 cursor-not-allowed` treatment, its `aria-label` swap, and its subtitle-text swap to "— Coming Soon —" are untouched.
- One pre-existing inconsistency worth fixing while in this file: the `grey` group (Settings tile) uses hardcoded arbitrary hex (`#4a5568`/`#374151`/`#5a6578`) instead of registered `rpx.*` tokens like every other group. Proposal: add `rpx.grey-light`/`rpx.grey`/`rpx.grey-hover` to `tailwind.config.ts` so all 5 groups are consistent — small, additive, zero behavior change.

**Not touched:** the tile data (label/subtitle/icon/href/group/comingSoon), the fixed 4×4 grid layout, the icon badge/text-block interior structure, routing.

**Verification:** visually compare all 16 tiles (5 color groups) before/after; click through 2-3 tiles to confirm routing still works; confirm the disabled Weighbridge tile still can't be clicked and still announces "— Coming Soon —" to screen readers.

---

## 2. Cancel button on the two POS wizards (low risk — additive only)

**Files:** `src/app/app/(modules)/purchases/new/page.tsx`, `src/app/app/(modules)/sales/new/page.tsx`.

**Confirmed reusable, no new plumbing needed:** `useConfirm()` from `@/components/ui/ConfirmDialog` — both pages already sit under `WindowedContent`'s `ConfirmDialogProvider` (via `(modules)/layout.tsx`), so it's available with zero setup. Real usage pattern already in the codebase at `expenses/page.tsx:100-108`.

**What changes:**
- **Purchases already has a reset block** (currently inlined into the pending-success path, `submitPurchase`'s `if (status === 'pending')` branch) — extract it into a standalone `resetForm()` function, and expand it to also reset the two right-column scale display readings (`scale1`/`scale2`/`readingScale1`/`readingScale2`), which the current inline block misses.
- **Sales has no equivalent reset block at all** (its pending-success path just navigates away, letting unmount handle cleanup) — build `resetForm()` from scratch, enumerating the ~20 state setters back to initial values, mirroring purchases' approach.
- Add a `Btn` (secondary variant, house style) labeled "Cancel" to each footer's action bar, alongside the existing single Submit/Save button.
- Cancel handler: check whether anything's actually been entered (e.g. `lines.some(l => l.productId || l.quantity || l.unitPrice) || !!customer` for purchases, the equivalent for sales — neither page tracks a dirty flag today, so this is a simple truthiness check, not real dirty-tracking). If something's entered, call `useConfirm()` with a "Discard this entry?" prompt (danger/warning variant, "Discard" / "Keep editing"); if confirmed (or nothing was entered), run `resetForm()` then `router.push('/app/purchases')` / `router.push('/app/sales')`.

**Decided:** Cancel navigates back to the module's list page (`/app/purchases` or `/app/sales`) rather than resetting in place — matches the conventional meaning of "Cancel" in a wizard (confirmed with the user).

**Not touched:** `submitPurchase`/`submitSale`'s validation, API calls, offline-queue handling, the business-loan-PIN gate on sales, or anything about how a *successful* submit behaves.

**Verification:** enter a partial line item, click Cancel, confirm the discard prompt appears and behaves as chosen; click Cancel with nothing entered, confirm no prompt (or a lighter one) fires; confirm a normal successful submit is completely unaffected.

---

## 3. Scale-admin — wrap in the real `AppShell` (medium risk)

**Confirmed:** `/scale/admin`'s auth (`src/app/scale/admin/layout.tsx`) is the exact same NextAuth `auth()` + `session.user.role`/`fullName` shape the main `/app/*` portal uses (admin/manager only — `scale_operator` is explicitly excluded, confirmed independently re-checked server-side in the void API route too). This means wrapping it in the **real** `AppShell` — not a parallel `ScaleAdminShell` — is the lower-effort, more consistent option, and there's no auth-mechanism mismatch to work around.

**What changes:**
1. `scale/admin/layout.tsx`: wrap `{children}` in the same provider stack `(modules)/layout.tsx` uses (`SessionProvider` → `OfflineProvider` → `AppShell`), passing `role`/`fullName` from the same `auth()` call already there. (`BannerBar`/`LicenseGate`/`PinLockOverlay`/`WindowedContent` are optional extras — recommend adding them for full consistency with the rest of the app, but they're not required for "give this section a shell.")
2. Add `/scale/admin` and `/scale/admin/orders` entries to `src/lib/module-names.ts`'s title/icon maps, so the breadcrumb shows a real name instead of falling back to "Renovo Pro."
3. In `orders/page.tsx`: replace the hand-rolled `<table>` with the shared `DataTable` + the already-correctly-imported `StatusBadge` (from BATCH-4), keeping the exact same columns (Order #, Customer/Casual, Product, Weight, Status, Operator, Date) and row actions (View, Void — hidden once `status === 'voided'`).
4. Replace the hand-rolled void-confirmation overlay with `RpxDialogContent`/`Header`/`Body`/`Footer`, preserving exactly: the 3-character-minimum reason textarea, the disabled-until-valid confirm button, the `POST /api/scale/orders/:id/void` call with `{ voidReason }`, and the existing query invalidation on success. (Note: this route's 3-char minimum is inconsistent with purchases/sales' 5-char void minimum elsewhere in the app — flagging, not fixing, since changing a validation minimum is a behavior change beyond this redesign's scope.)
5. Replace the hand-rolled detail modal with `RpxDialogContent`, preserving every field currently shown (status, date/time, customer, single vs. multi-line product breakdown, operator, notes, void reason, grouped photo grid, slip PDF link).
6. Extract `PhotoViewerOverlay` (currently a private, page-local component in `orders/page.tsx`) into `src/components/ui/PhotoViewerOverlay.tsx`. Confirmed fully self-contained (own state, `createPortal`-based, only depends on `design-tokens.ts`) — zero behavior change, just makes it reusable.
7. `scale/admin/page.tsx`'s own mini-dashboard (stat cards + today's orders): restyle onto `colors.*`/`PANEL`/`PANEL_HEAD` instead of raw Tailwind slate/emerald classes. Keep its own data-fetching as-is.

**Not touched:** the void/process business logic, the `pending`/`processed`/`voided` status semantics, the R2 signed-URL photo resolution, any API route.

**Verification:** load `/scale/admin` and `/scale/admin/orders` as an admin/manager account, confirm the breadcrumb and shell render correctly; void an order end-to-end and confirm the same API contract fires; open the detail modal and photo viewer and confirm every field/photo still displays.

---

## 4. Auth shell unification (medium-high risk — security-relevant logic nearby)

**Confirmed genuinely different, must-not-touch logic per page** (this is why the shared piece must be presentational-only):
| | `/login` | `/gate/login` | `/scale/login` |
|---|---|---|---|
| Tenant slug field | Yes (progressive disclosure) | No | No |
| Role allow-list | *Excludes* `scale_operator`/`security_guard` (blocks + **signs out**) | *Requires* `security_guard`/admin/manager (blocks, session **stays**) | *Requires* `scale_operator`/admin/manager (blocks, session **stays**) |
| Redirect target | `/app/dashboard` | `/gate` | `/scale` |
| Auto-redirect if already authenticated | No | Yes | Yes |
| Session-loading splash | No (server component, no client session race) | Yes (separate render branch) | Yes (separate render branch) |

**What changes:** build one presentational `AuthShell` component (e.g. `src/components/auth/AuthShell.tsx`) that owns only: outer background, card chrome (`CARD_BORDER`/`BAR_GRAD`/3px radius, replacing each page's own `rounded-lg`/`rounded-2xl` + shadow), the logo/icon badge, a title using the new `colors.mainInstruction` token (added in BATCH-1, currently unused anywhere — this becomes its first real consumer), an error-banner slot, and a loading-session splash variant. Props: `accentColor` (navy/blue/emerald — kept distinct per kiosk, matching the project's existing "differentiate mirrored features" convention), `icon`, `title`, `subtitle`, `errorMessage`, `isSessionLoading`, and `children` for the actual form body.

Each page keeps 100% of its own `onSubmit`, `signIn()` call, role-list check, redirect, and tenant-slug logic exactly as it is today — only the JSX wrapping the form changes.

**Bundled accessibility fix:** standardize `htmlFor`/`id` label pairing across all three (currently only `/login` has this correctly; gate/scale login have plain `<label>`/`<input>` with no association) — low-risk, high-value, natural to fix while touching this markup anyway.

**Not touched:** `signIn()` calls, `LoginSchema`/Zod validation, role allow-lists, redirect targets, the tenant-slug mechanism, sign-out-on-wrong-role vs. leave-session-active behavior.

**Verification:** log in successfully on all three; trigger a locked/inactive/wrong-password error on each and confirm the right message shows; log in with a `scale_operator` account on `/login` and confirm it still blocks + signs out; log in with an `admin` account on `/gate/login` and `/scale/login` and confirm both still work (admin is in every allow-list); confirm the company-code field still only appears on `/login`.

---

## 5. Kiosk shell unification — Gate + Scale (highest risk, do last)

**Confirmed, changes the risk profile a lot:** both `GatePage` and `ScalePage` already implement a working `handleBack()` with correct purpose/config-driven step-skip logic, and going Back does **not** lose already-committed data at the parent-state level (only the currently-open step's in-progress form re-renders blank — a pre-existing limitation, not something this change introduces or worsens). **`CheckOutMode` is a separate full-screen search/list mode with no step concept and must NOT be wrapped in the step-shell** — it toggles in at the `mode` level, one layer above the step UI.

**What changes:** build one presentational `KioskShell` (header + generalized step-progress bar + a bottom command row that renders **Back only**, not Back+Next — see why below) consumed by both `GatePage`'s and `ScalePage`'s step-flow UI (not `CheckOutMode`, not Scale's desktop-only `lg:` sidebar, which stays as an additive enhancement layered on top).

**Why the shell can only own "Back," not "Next":** in both modules, forward progress is triggered from *inside* each step component's own submit/selection action (e.g. `StepVisitor`'s form submit, `StepCategory`'s tap-to-select) — there is no single generic "Next" action at the shell level to hook into. Unifying that would mean restructuring how every step reports completion, which is a much bigger, higher-risk change than what's needed to fix the actual finding (no back arrow, no consistent command-row placement). The shell takes `current`/`total` (for the progress bar) and the already-existing `handleBack` function as a prop; each step keeps its own forward CTA exactly as it is today.

**Header:** becomes shared chrome (same gradient, same layout) between Gate and Scale; `accentColor` stays a per-kiosk prop (blue for Gate, emerald for Scale) — confirmed via grep that this color choice has zero functional/business branching tied to it anywhere, purely cosmetic.

**No confirm-dialog needed on Back:** since Back doesn't lose committed data, adding a "discard changes?" prompt here would just add friction for no safety benefit — skipping it (unlike the POS wizards' Cancel, where real data loss is at stake).

**Not touched:** either module's state shape, `handleBack()`'s skip logic, `stepConfig`-driven step enabling, the scale kiosk's cart/queue logic, `CheckOutMode`, the desktop-only sidebar.

**Verification:** step through a full Gate visitor-entry flow and a full Scale weigh-in flow end to end, including a purpose/category combination that triggers step-skipping; use Back at multiple points and confirm previously-entered data for *other* steps is unaffected; confirm CheckOutMode and the desktop sidebar behave exactly as before.

---

## Sequencing

1. Dashboard (pure visual, zero logic surface)
2. POS wizard Cancel (additive, isolated)
3. Scale-admin shell (medium — new to shared components, but auth/API contracts are simple and confirmed compatible)
4. Auth shell (medium-high — three pages, security-relevant branches nearby, needs care)
5. Kiosk shell (highest — most-used operational screens, most step-state complexity)

Each item gets its own `tsc`/lint verification and its own commit, same protocol as the BACKLOG batches.
