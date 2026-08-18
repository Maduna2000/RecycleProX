# MT4-Style Window Chrome — Title Bars, Buttons, Dialogs, Taskbar

**Date:** 2026-08-18
**Status:** Approved
**Scope:** Structural/chrome pass across the whole app (module pages, dialogs, the open-windows taskbar). Dashboard excluded. No color/token changes — same navy/gray palette throughout, only borders, bevels, sizing, and how components fuse together.

---

## Context

`docs/superpowers/specs/2026-05-24-legacy-window-management-design.md` (Approved) built the current legacy-MDI system: a per-page `PageTitleBar` with minimize/close, a `WindowTaskbar` tracking up to 4 open pages, all in service of a "legacy SaaS desktop feel (Java Swing / MDI-style)." That spec deliberately made `PageTitleBar` a "barely visible tint" (`rgba(27,58,107,0.05)`, no border) — a lightweight strip sitting *above* `ContentCard`, which has its own real `CARD_BORDER`. A later, narrower patch (the page-width-cap commits, #88–#104) added a border to `PageTitleBar` but only for the handful of pages registered in `pageWidthCaps.ts`, leaving most pages with the original invisible bar.

The user's complaint: pages "look like components combined together," not one window — the title bar visibly floats separately from the content card beneath it, everywhere except the few width-capped pages. Reference: MetaTrader 4's window/dialog/button/taskbar structure. Explicitly **not** a palette change — same NAVY/BAR_GRAD/CARD_BORDER tokens throughout, just applied consistently and with more pronounced 3D structure. Dashboard is explicitly excluded (it doesn't render `PageTitleBar` today and stays that way).

---

## 1. Title bar + window fusion

**`src/components/ui/PageTitleBar.tsx`** — always renders the same chrome dialogs already get (`BAR_GRAD` background, `GLOSS_BEVEL` shadow, `CARD_BORDER`, bold `NAVY` title text), not just on width-capped pages. The `widthCap !== null` branch currently gates whether a border/rounding is applied at all — that gate goes away; `widthCap` still controls max-width/centering, but the chrome (border, gradient, bevel, rounded top corners) becomes unconditional. Height increases from 28px to 34px to match the dialog header height it's now sharing chrome with.

The `[−]`/`[×]` controls move from bare hover-only icon buttons into a small bordered button group (reusing the new `Btn`-style bevel at a compact size), so they read as physical window controls rather than floating icons.

**`src/components/rpx/primitives.tsx`'s `ContentCard`** — flips its default to `borderTop: 'none'` with squared top corners, since `PageTitleBar` now unconditionally owns the top edge on every page. Per-page `cardStyle={{ borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}` overrides (currently only on `customers/[id]`) become redundant and get removed once this is the default — one shared component fix instead of per-page opt-in, so no future page can forget it.

## 2. Button system

**`src/components/rpx/styles.ts`** (`btnPrimary`/`btnSecondary`/`btnDanger`) — replace the flat uniform `CARD_BORDER` + single faint inset highlight with a real raised bevel: lighter border on top/left, darker on bottom/right, same base gray family (no new colors). Heights become fixed rather than padding-derived — `md` = 30px (matching `inp`'s height for visual alignment with form fields), `sm` = 24px — so a button's box no longer depends on its label length or its neighbors.

**`src/components/rpx/Btn.tsx`** — adds a pressed state (today there's only hover): on `onMouseDown`/`onMouseUp` (mirroring the existing imperative `onMouseEnter`/`onMouseLeave` hover-swap pattern, since these are inline styles, not CSS classes), invert the bevel (dark top/left, light bottom/right) and shift the button down 1px, so clicking visibly "pushes it in."

**Audit** — grep `src/app/app/(modules)` and `src/components` for raw `<button` elements bypassing the shared `Btn` component; convert the clear cases so there's one real source of truth for what a button looks like, closing the "inconsistent across pages" gap at the source rather than just at the shared component.

## 3. Dialogs / pop-outs

Factor the title-bar chrome (gradient, bevel, border, title typography) that `PageTitleBar` and `RpxDialogHeader` (`src/components/rpx/Dialog.tsx`) both need into one shared definition, so the two are provably identical instead of two hand-tuned components that happen to match today. `RpxDialogFooter` buttons already use `Btn`, so they inherit the new bevel/press-state automatically. `RpxDialogHeader`'s close button gets the same bordered window-control treatment as `PageTitleBar`'s controls — no minimize button there (modals aren't minimizable), just the one close control restyled to match.

## 4. Open-windows taskbar

**`src/components/ui/WindowTaskbar.tsx`** — inactive tabs get a subtle raised bevel (matching the new button idle state); the active tab gets an inset/pressed bevel (matching the new button pressed state) instead of today's flat transparent/hover-tint-only styling. The existing amber top border on the active tab stays as a color-coded signal layered on top of the new bevel, not replaced by it.

---

## Explicitly out of scope

- Dashboard (no `PageTitleBar`, untouched).
- Any color/token change — `NAVY`, `BAR_GRAD`, `colors.danger`, etc. all stay as-is.
- `TabStrip` (folder tabs) — already uses a beveled gradient/gloss look consistent with this direction; not called out as a problem.

## Verification

- Every module page's title bar visually fuses with its content card (no visible seam/gap) at both full width and capped widths.
- Buttons show a visible pressed state on click, and every `Btn` on a given page/row shares the same height regardless of label length.
- Dialog headers and page title bars are visually identical in chrome (gradient, bevel, border weight, title typography).
- Open-windows taskbar tabs show a raised/pressed bevel distinction between inactive and active tabs.
- `npx tsc --noEmit` clean; spot-check Dashboard is unaffected.
