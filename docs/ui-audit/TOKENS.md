# Renovo Pro — Token Remediation Plan

Companion to [`AUDIT.md`](./AUDIT.md). This document proposes the canonical token set and maps every magic value found during the audit to it. No code has been changed — this is the plan the batches in [`BACKLOG.md`](./BACKLOG.md) execute against.

**Guiding rule:** consolidate, don't add. Every proposal below either keeps an existing declared token as-is, renames/repoints an existing one, or deletes a duplicate — nothing here introduces a new parallel system. Where two *already-declared* "canonical" values disagree (see §1 root cause), the fix is to make one of them win and delete the other, not to add a third.

---

## 0. Root cause: two files both claim to be canonical, and they disagree on one value

`tailwind.config.ts:47-51` and `src/lib/design-tokens.ts:18-32` both declare what they present as the one true brand palette:

| Color | `tailwind.config.ts` (`rpx.*`) | `design-tokens.ts` (`colors.*`) | Agree? |
|---|---|---|---|
| Navy | `#1B3A6B` | `#1B3A6B` (`colors.primary`) | ✅ |
| Blue | `#185ABD` | `#185ABD` (`colors.process`) | ✅ |
| Amber | `#C9A020` | `#C9A020` (`colors.warning`) | ✅ |
| Red | `#C0392B` | `#C0392B` (`colors.danger`) | ✅ |
| **Green** | **`#217346`** | **`#10b981` (`colors.action`)** | **❌** |

Three of four brand colors are declared identically in both files — green is the sole exception, and it happens to be the one color used for money (the single highest-stakes visual value in a financial app). This is the direct, root-cause explanation for FND-015's "positive money green" drift: individual files didn't independently invent inconsistency, they consulted one of two already-inconsistent sources of truth.

**Decision:** adopt **`#217346`** (the `tailwind.config.ts` value) as the single canonical action-green and repoint `colors.action` to it. Rationale: `#217346` is already the majority usage for money figures across purchases/products (evidenced in the audit), it reads as a deliberate "ledger/accounting green" that fits the Win7/Office-era aesthetic target better than `#10b981`'s modern-SaaS emerald, and it requires changing one file (`design-tokens.ts`) rather than the dozens of call sites that already use it correctly.

---

## 1. Canonical color palette

| Token | Value | Supersedes / consolidates |
|---|---|---|
| `colors.primary` (navy) | `#1B3A6B` | unchanged |
| `colors.action` (green) | **`#217346`** (changed from `#10b981`) | `#10b981`, hand-rolled `#217346` literals (now redundant, replace with the token import) |
| `colors.process` (blue) | `#185ABD` | unchanged — also becomes the single focus/selection blue, see below |
| `colors.warning` (amber) | `#C9A020` | unchanged |
| `colors.danger` (red) | `#C0392B` | **`#DC3545`** (police/page.tsx + rpx/primitives.tsx — see decision below), Tailwind `red-500/600/700` used semantically in Gate/Scale/Scale-admin |
| `colors.borderFocus` | `#185ABD` | **`#0078D7`** (`globals.css:134`, `ui/input.tsx:12`) — pick one focus blue, this one already has a named token |
| `colors.actionHover` | `#059669` → recompute as a darkened `#217346` (e.g. `#1a5c38`, already used ad hoc in `CasualSelectorPanel.tsx`) | old `#059669` |

**Danger-red decision:** `police/page.tsx` (`#DC3545`, ×11) is the codebase's own stated reference file, but it predates/diverges from `colors.danger`. Recommend reconciling `police/page.tsx` → `colors.danger` (`#C0392B`) rather than changing the token, since `#C0392B` already matches `tailwind.config.ts` and is used correctly on the one page (`LoginForm.tsx`) that got it right. `rpx/primitives.tsx:16`'s `FormLabel` required-asterisk color should follow the same change.

**Money palette (payment modals):** `SplitPaymentModal`/`ProcessPaymentModal`/`RecordPaymentModal`/`SaleSplitPaymentModal` share a third, undocumented amber/orange system (`#FFF8E1`,`#FFE082`,`#F57F17`,`#FFF3E0`,`#FFCC80`,`#E65100`,`#EF6C00`) distinct from both `colors.warning*` and `colors.alert*`. Recommend collapsing these onto the existing `colors.alertBg`/`alertBorder`/`alertIcon`/`alertText` set (already defined in `design-tokens.ts:96-108` for exactly this "loan/alert banner" purpose) rather than keeping a third amber family alive.

**Change-password strength meter:** `red-500`/`amber-500`/`blue-500`/`green-500` (raw Tailwind) → `colors.danger`/`colors.warning`/`colors.process`/`colors.action` respectively.

---

## 2. Canonical gradient set (target: ≤6, currently 11+)

| # | Gradient | Constant name | Usage |
|---|---|---|---|
| 1 | `linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)` | `HEADER_GRAD` (exists, `rpx/styles.ts:18`) | Sticky table headers, card/dialog title strips |
| 2 | `linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)` | `BAR_GRAD` (exists, `rpx/styles.ts:20`) | All `Btn` variants, panel/dialog title bars |
| 3 | `linear-gradient(180deg,#217346 0%,#1a5c38 100%)` | **new:** `ACTION_GRAD` | Primary money/CTA affordances currently hand-rolled as `#10B981→#059669` (`LoansTab.tsx:162,202`) — recolored to match the new canonical green |
| 4 | `linear-gradient(180deg,${colors.violet} 0%,#6B21A8 100%)` | **new:** `VIOLET_GRAD` | Business-Loan CTA (`BusinessLoanTab.tsx:195,217`) — kept distinct per the project's own "differentiate mirrored features" convention (Business Loan must not look identical to Loan) |
| 5 | `linear-gradient(180deg, #14294A 0%, #0F203A 100%)` | **new:** `KIOSK_HEADER_GRAD` | Gate/Scale/Police kiosk headers — consolidates Gate's existing header gradient, Gate login's radial variant, and gives Scale's currently-flat header a gradient too, so the three kiosks finally share one header recipe (see [REDESIGN.md](./REDESIGN.md)) |
| 6 | *(reserved)* | — | Keep one slot free rather than filling it — if Aero glass is added to real chrome per §7 below, it needs a 6th "glass" gradient/tint recipe, not a 7th flat one |

**Deleted (fold into #1/#2 above, no visual change since most are byte-identical or near-identical):** `#F5F5F5→#EBEBEB` (`LoansTab.tsx:218`), `#F5F5F5→#ECECEC` (`sales/[id]`, `purchases/[id]`), `#F5F5F5→#E8E8E8` (`purchases/new:1302`, `sales/new:1142`), `#FAFAFA→#F0F0F0` (`CustomerProfileModal.tsx:147`) — all four are close enough to `HEADER_GRAD`/`BAR_GRAD` that they should simply become the constant, not a new named value. **Not a gradient, keep as-is:** the diagonal checkerboard transparency swatch (`settings/page.tsx:103`) — different category, not chrome.

**Dashboard tiles** (`dashboard/page.tsx:48-54,94`, Tailwind `bg-gradient-to-br`) are addressed structurally in [REDESIGN.md](./REDESIGN.md), not by adding them to this list — a Win7-committed dashboard shouldn't use diagonal tile gradients at all.

---

## 3. Type ramp (mostly correct — one real gap)

| Token | Value | Status |
|---|---|---|
| `fontFamily` | `"Segoe UI", -apple-system, Arial, sans-serif` | ✅ correct, keep |
| `fontSize.xs..2xl` | 11/12/13/14/16/20/24px | ✅ correct, keep — genuinely matches a dense Win7-appropriate scale |
| `fontWeight` | 400/500/600/700 | ✅ correct, keep |
| **`colors.mainInstruction`** | **new: `#003399`** | **Missing entirely.** Every page heading in the app currently uses `colors.textPrimary` (near-black) or navy — none use the Win7 dialog/wizard "main instruction" blue. Add this token and apply it to page/section titles (`styles.pageTitle`, `styles.sectionTitle` in `design-tokens.ts:293-304`) — this is the single cheapest, highest-signal typographic fix in the whole audit, since it's one new color plus swapping two existing shared style objects to use it. |
| `colors.link` | **new: `#0066CC`**, underline-on-hover | Currently absent — in-content links use `colors.process` or ad hoc blue Tailwind classes with no consistent underline rule. Add and apply to genuine navigational links (not buttons styled as links). |

---

## 4. Spacing

`spacing` (4/8/12/16/20/24/32px, `design-tokens.ts:208-216`) is correct and consistently applied where sampled — no change proposed.

---

## 5. Radii (currently 4 competing values: 2px / 3px / 8px / 10px)

| Context | Canonical value | Current violators |
|---|---|---|
| Inputs, badges | `layout.inputRadius = 2px` | Tailwind-default badge radii in `customers/page.tsx` badges (~4px), `TradeCommoditiesSelect.tsx` (`rounded-md`, ~6px) |
| Buttons, panels, dialogs | `layout.btnRadius = 3px` | `Btn.tsx`'s own `btnPrimary` (3px) vs. `btnSecondary`/`btnDanger` (2px) — **fix within the same component first**; `RpxDialogContent` hardcodes `10px` (`rpx/Dialog.tsx:40`) — should be 3px; `stocktake/[id]/page.tsx` panels use `2px` instead of the `PANEL` constant's `3px` |
| **`layout.cardRadius = 8px`** | **Recommend deleting this token entirely** | It's only consumed by `tw.card` (`design-tokens.ts:168`), which is itself unused by the audited portal pages (zero `@/components/ui/card` usage found anywhere). If a genuinely modern card surface is ever wanted again (kiosk/auth pages already use `rounded-lg`/`rounded-xl`/`rounded-2xl` ad hoc), define it explicitly there rather than keeping an orphaned "8px card" token that implies a card system the portal doesn't actually use |
| Kiosk/auth cards (if kept modern, see REDESIGN.md) | `rounded-lg` (login) / `rounded-xl`/`2xl` (Gate/Scale) | Currently 3 different radii for "a card" across 3 files even within this already-separate modern-styled group — pick one if the kiosk redesign keeps any card surfaces at all |

---

## 6. Borders / bevels

- `CARD_BORDER = '1px solid #B0B0B0'` (`rpx/styles.ts:22`) — correct, keep, and use it everywhere a panel/dialog currently hardcodes `#B0B0B0`/`#C0C0C0`/`#D0D0D0` inline (several found in `sales/new`, `purchases/new`, `police/page.tsx`).
- **No inner-highlight/bevel exists anywhere.** `Btn` is a flat gradient fill with a flat border and a flat hover color-swap — there is no 1px lighter inset highlight on the top edge, which is what gives a real Win7 button its "raised" read. Recommend adding one line to `Btn`'s base style: `boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)'` (a subtle top highlight over the existing `BAR_GRAD`) — cheap, additive, and the single most authentic "Aero" texture upgrade available for the cost.
- Dialog/panel drop shadows: none currently used for `RpxDialogContent`/`PANEL` (correctly relying on `CARD_BORDER` alone, which is period-appropriate) — but `LoginForm.tsx` (`shadow-lg`) and `PinLockOverlay`/`LicenseGate` (`shadow-2xl`) do use soft diffuse shadows, which is exactly the "modern card" tell the brief warns about. These three are addressed in REDESIGN.md, not here, since they need a structural rebuild, not a token swap.

---

## 7. Control heights

| Element | Canonical | Declared | Conflict |
|---|---|---|---|
| Inputs | 30px | `ui/input.tsx:12`, `globals.css:113-122`, `rpx/styles.ts` `inp:26` | ✅ agree with each other |
| Table rows | 30px | `layout.tableRowH = 30` (`design-tokens.ts:226`), `DataTable.tsx` | ✅ but `audit-log` (32px), `cashup` recon rows (24-26px), `police-register` nested sub-table (24px) all violate it — see FND-012 |
| **Toolbar strip** | **conflict:** `layout.toolbarH = 36` (`design-tokens.ts:230`) vs. `AppShell.tsx:706`'s actual CSS var default `var(--rpx-toolbar-h, 32px)` | **Pick one.** Recommend **32px** (what's actually rendered today) and update `layout.toolbarH` to match, rather than changing the live shell's rendered height |
| Buttons | Not explicitly declared as a height token — `Btn`'s primary/secondary padding (`'7px 16px'`/`'5px 12px'`) produces ~28-30px effective height depending on font-size | Add an explicit `layout.btnHeight = 30` token so future button work has something to target instead of reverse-engineering padding |
| Kiosk touch targets (Gate/Scale) | Currently 48-52px, `rounded-xl` | Intentionally larger for touch — **keep as a documented, separate "kiosk" scale**, not a violation, but it should be named/declared (`layout.kioskControlHeight = 48`) instead of being a bare undocumented Tailwind class repeated per-file |

---

## 8. Glass recipe (currently: none on chrome)

Aero glass does not exist anywhere in this codebase's actual window chrome — the 5 confirmed `backdrop-blur` usages are all modal/lock-screen scrims (`bg-black/10`–`/20` or `bg-gray-900/95` + blur), which is a different, legitimate pattern (dimming background content behind a modal) and should **stay** — it is not what this section is about.

If the lead auditor wants to add real chrome glass (title bar / command bar) rather than accept the flat-navy status quo as a deliberate simplification, propose this recipe for `AppShell`'s Zone 1/Zone 2 backgrounds:

```css
background: linear-gradient(180deg, rgba(27,58,107,0.88) 0%, rgba(15,32,58,0.82) 100%);
backdrop-filter: blur(12px) saturate(1.4);
-webkit-backdrop-filter: blur(12px) saturate(1.4);
border-bottom: 1px solid rgba(255,255,255,0.12);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.18); /* top inner highlight, per §6 */
```

**Fallback (required — `backdrop-filter` support isn't universal):** `@supports not (backdrop-filter: blur(1px))`, fall back to the current flat `#1B3A6B` solid — the app already does exactly this pattern correctly for dialog scrims (`supports-backdrop-filter:` Tailwind variant in `ui/dialog.tsx:34`), so the precedent to copy is already in the codebase.

**Contrast check required before shipping:** white text (`text-white`, `text-[#8BA4D4]` for breadcrumb) over a blurred, semi-transparent navy needs to be re-verified at actual render time, not assumed from the hex math alone — this is exactly the "classic Aero readability trap" the brief warns about, and it is not verifiable from static code reading (see the coverage note in AUDIT.md). Flag for manual/visual check once implemented, before considering this recipe done.

This is presented as an option, not a requirement — the flat navy title bar is not "broken" today the way the button/gradient/badge drift is; it's simply the one deliberate area where the app hasn't attempted Aero glass at all. Treat as a BATCH-6/polish-tier item, not urgent.

---

## 9. Full magic-value → canonical-token mapping

| Current value | File:line (representative) | → Canonical token |
|---|---|---|
| `#10b981` (`colors.action`) | `design-tokens.ts:26` | `#217346` (repoint the token itself, §1) |
| `#217346` (hand-rolled) | `purchases/new/page.tsx:859,1088,1177`, `ProcessPaymentModal.tsx`, `products/page.tsx` | `colors.action` (import, now equal) |
| `#DC3545` | `police/page.tsx` ×11, `rpx/primitives.tsx:16` | `colors.danger` |
| `#0078D7` | `globals.css:134`, `ui/input.tsx:12` | `colors.borderFocus` (`#185ABD`) |
| `linear-gradient(180deg,#F5F5F5 0%,#EBEBEB 100%)` | `LoansTab.tsx:218` | `BAR_GRAD` |
| `linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)` | `sales/[id]:203,209,217`, `purchases/[id]:216,224` | `HEADER_GRAD` |
| `linear-gradient(180deg,#F5F5F5 0%,#E8E8E8 100%)` | `purchases/new:1302`, `sales/new:1142` | `HEADER_GRAD` |
| `linear-gradient(180deg,#FAFAFA 0%,#F0F0F0 100%)` | `CustomerProfileModal.tsx:147` | `HEADER_GRAD` |
| `linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)` (hand-typed) | `DataTable.tsx:228`, `police/page.tsx:315,581,731,914`, `purchases/new:539`, `cashup:232,243`, `CustomerProfileModal.tsx:78` | `HEADER_GRAD` (import) |
| `linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)` (hand-typed) | `stocktake/[id]:435,527`, `purchases/new:552` | `BAR_GRAD` (import) |
| `linear-gradient(180deg,#10B981 0%,#059669 100%)` | `LoansTab.tsx:162,202` | `ACTION_GRAD` (new, §2) |
| `#14294A→#0F203A` gradient | `GateClientLayout.tsx:36` | `KIOSK_HEADER_GRAD` (new, §2) |
| `radial-gradient(...#1B3A63...#0F203A...)` | `gate/login/page.tsx:67,76` | `KIOSK_HEADER_GRAD` (flatten radial→linear for consistency with the other two kiosks) |
| Flat `bg-slate-900` header | `ScaleClientLayout.tsx:111` | `KIOSK_HEADER_GRAD` |
| `#FFF8E1`/`#FFE082`/`#F57F17`/`#FFF3E0`/`#FFCC80`/`#E65100`/`#EF6C00` | 4 payment modals | `colors.alertBg`/`alertBorder`/`alertIcon`/`alertText` |
| `red-500`/`amber-500`/`blue-500`/`green-500` (strength meter) | `change-password/page.tsx:19-22` | `colors.danger`/`warning`/`process`/`action` |
| `rounded-lg`/`rounded-xl`/`rounded-2xl` (portal-context badges/pickers) | `customers/page.tsx` badges, `TradeCommoditiesSelect.tsx:49` | `layout.inputRadius` (2px) or `layout.btnRadius` (3px) as appropriate |
| `10px` dialog radius | `rpx/Dialog.tsx:40` | `layout.btnRadius` (3px) |
| `2px` panel radius | `stocktake/[id]/page.tsx:421,425,434,526` | `PANEL`'s `3px` (import the constant instead of hardcoding) |
| `36px` (`layout.toolbarH`) | `design-tokens.ts:230` | `32px` (match `AppShell.tsx:706`'s actual rendered default) |
| Unicode `▲`/`▼` | `audit-log/page.tsx:234` | lucide `ChevronDown`/`ChevronRight` (not a color/token fix, but included here since it's a one-line swap alongside the row-height fix in the same file) |

This table is representative, not exhaustive — [`INVENTORY.md`](./INVENTORY.md) §3 has the full raw catalog every row above was drawn from. Execute via [`BACKLOG.md`](./BACKLOG.md) BATCH-1 (colors/gradients) and BATCH-2 (controls/radii/heights).
