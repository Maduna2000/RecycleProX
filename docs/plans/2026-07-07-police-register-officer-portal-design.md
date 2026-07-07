# Police Register — Officer Portal Design

**Date:** 2026-07-07
**Status:** Validated with product owner
**Module:** M12 Police Register (extends existing partial implementation)

## Background

The codebase already contains a manager-facing police register at `/app/police-register`:
a daily purchases-register PDF generator (SAPS 601-style columns) plus a visit history
with signature capture. The middleware whitelists a public `/police` route that was never
built — the dangling reference this design resolves.

The original RecycleProX (Lariat Technologies) ships a **Digital Police Register approved
by SAPS**: an officer must identify themselves (name, rank, service number, station)
before any register data is shown; they can then inspect the register and digitally sign
to prove the visit. This design replicates that, adapted to this codebase's patterns
(the scale-station split: standalone full-screen route + nav-bar popup button + admin
page under `/app`).

## Decisions made

| Question | Decision |
|---|---|
| Officer access model | **Per-visit registration** — no officer passwords; each visit is a self-contained, signed session |
| Search scope | All four: register by date, person search, goods search, transaction photos |
| Portal access | **Staff-launched** from a nav button; `/police` requires a staff session (not public) |
| Jurisdiction wording | **Configurable per yard** via SystemSettings (SAPS default, EPS supported) |

## 1. Architecture

Two faces, mirroring the scale module:

**Officer portal — `/police` (new, full-screen).** No separate login system. Middleware
changes `/police` from public to session-required. A logged-in staff member opens it from
a new **Police** popup button in the top navigation bar (beside the Scale button, same
style). The officer registers their visit, the portal enters an active **inspection
session**: persistent banner ("Police inspection in progress — [Officer]") with an End
Inspection button; searches enabled; every executed search logged against the visit.
Ending the session captures the officer's digital signature (existing canvas component)
and closes the visit.

**Staff side — `/app/police-register` (existing, extended).** Generate Register PDF tab
kept. Visit History upgraded to show per-visit search activity and inspection summary.

**Data layer.** Extended `PoliceVisit` + new `PoliceSearchLog`. All writes through
`policeVisitService.ts`, Zod-validated, transactional where multi-table.

## 2. Officer flow

1. **Launch** — nav **Police** button → popup tiles: "Officer Portal" (`/police`) and
   "Register Admin" (`/app/police-register`). Portal opens full-screen showing yard name,
   configured police service name, and a "Begin Inspection" card.
2. **Register visit** — officer enters: full name*, rank*, service/force number*,
   police station*, contact number (optional), reason for visit (dropdown: routine
   inspection / stolen goods investigation / person enquiry / other + note).
   Zod-validated. Creates a `PoliceVisit` with `status: 'active'`; visit ID held in
   React state + `sessionStorage` so refresh doesn't lose the session.
3. **Search** — three tabs (§3). Every executed search writes a `PoliceSearchLog` row.
4. **End inspection** — signature canvas → `status: 'completed'`, `signedAt`, signature
   to R2. Summary screen offers "Download Inspection Certificate" PDF (officer details,
   time in/out, searches performed, signature). Portal resets for the next visit.
5. **Abandonment safety** — 15 minutes of inactivity auto-ends the session as
   `status: 'expired'` (unsigned).

## 3. Schema changes (one migration)

- `PoliceVisit` gains: `rank`, `contactNumber`, `visitReason`, `visitNote`,
  `status` (`active | completed | expired`), `startedAt`, `signedAt`,
  `launchedByUserId` (staff member who opened the portal).
  New columns nullable/defaulted; existing rows read as `completed`.
- New `PoliceSearchLog`: `id` (uuid), `visitId` (FK → PoliceVisit), `searchType`
  (`register_by_date | person | goods`), `queryText`, `resultCount`, `createdAt`.

## 4. Search screens

Shared layout per tab: compact filter bar, results table, click-row detail drawer.
Only **completed** purchases are queried — pending/voided are not part of the legal
register. Logging happens on submit, not per keystroke.

**Tab 1 — Register by Date.** Date-range picker (defaults today). SAPS 601 columns:
time, reference number, seller name, ID number, date of birth, address, goods
description (product + quantity + unit per line), amount paid. Drawer: full purchase
lines, seller ID photo, transaction photos. "Download PDF" reuses the existing register
PDF for the chosen date.

**Tab 2 — Person Search.** One box accepting name or ID number (partial,
case-insensitive across firstName / lastName / idNumber). Results: ID photo thumbnail,
ID number, phone, address, **blacklist badge**, purchase count. Drawer: full profile,
enlarged ID photo, complete transaction history (expandable to lines + photos).

**Tab 3 — Goods Search.** Product picker (searchable catalogue dropdown) + optional
date range + optional minimum quantity. Results: every purchase line of that product in
range — date, seller, quantity, amount, photos.

**Photos.** All images via short-lived R2 view URLs (`getViewUrl`) — nothing publicly
linkable.

## 5. Navigation, permissions & settings

**Nav button.** `PolicePopup` in `AppShell.tsx` beside `ScalePopup`, identical styling
(shield icon, "Police"). Visible to admin/manager and any user whose `allowedModules`
includes `/app/police-register` — reuses the existing permission key, no new plumbing.

**Middleware.** `/police` leaves the public list: requires a session, any role except
`scale_operator` (redirected to `/scale` as today). Launching staff recorded as
`launchedByUserId`.

**Staff page upgrades.**
- Visit History: status column (Active / Completed / Expired); rows expand to the search
  log (type, query, result count, time) plus signature and certificate links.
- Managers get a "Force End" action on active visits (ends as expired).
- Generate Register tab keeps working; hardcoded Eswatini text replaced by settings.

**Settings** (new SystemSettings keys, edited in a "Police Register" card on the
settings page):
- `police_service_name` — default "South African Police Service (SAPS)".
- `police_legal_note` — retention/compliance sentence shown on portal, staff page, and
  printed on both PDFs.

## 6. API surface

All routes: Zod-validated, session + role checked, pino-logged.

| Route | Change |
|---|---|
| `POST /api/police-visits` | Extended — creates `active` visit with new fields |
| `PATCH /api/police-visits/[id]` | Extended — sign + complete, or manager force-end |
| `GET /api/police-visits` | Extended — returns status + search logs |
| `GET /api/police-search/register` | **New** — register-by-date search |
| `GET /api/police-search/person` | **New** — person search |
| `GET /api/police-search/goods` | **New** — goods search |
| `GET /api/police-visits/[id]/certificate` | **New** — inspection certificate PDF |
| `GET /api/police-register?date=` | Unchanged |

Each search route requires an active `visitId`; the server verifies the visit is active
and writes the `PoliceSearchLog` row **in the same transaction** as the query — logging
cannot be bypassed from the client.

## 7. Error handling

- Search on an expired/completed visit → typed **409**; portal shows "Inspection session
  has ended" and returns to Begin Inspection.
- R2 photo failure → placeholder image; never breaks the results table.
- All errors bubble typed and pino-logged; no silent swallows. Audit-log middleware
  covers all writes as elsewhere.

## 8. Testing

- **Vitest, service layer:** visit lifecycle (create → search → sign → complete),
  15-minute expiry rule, force-end, each search query shape (blacklist flag included,
  completed-purchases-only filter enforced).
- **Zod schema tests** for new inputs.
- **End-to-end verification** after implementation via Playwright (webapp-testing):
  launch portal → register officer → run all three searches → sign → confirm visit
  history shows the search log and certificate.
