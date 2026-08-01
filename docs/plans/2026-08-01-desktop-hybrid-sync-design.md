# Desktop Hybrid Sync — Design

## Context

The existing Electron desktop app (`electron/main.js`) already runs the full Next.js UI locally, gated on device activation, with an isolated local SQLite database that never talks to production. Separately, `scripts/local-server/` runs the same app locally against the shared production Postgres database, but has no offline capability at all.

This design evolves the Electron app into the single production till/office deployment for Golden Key's yard: normally connected straight to production Postgres, falling back to a local queue only when the internet actually drops, then reconciling automatically once it returns. Everything already working (UI/layout, auto-print-on-payment, cash-drawer pulse, activation flow) stays as-is.

**Deployment scope:** one PC (the till/office machine). Scale Station and Gate Station kiosks are unaffected — they keep running as always-online browser kiosks with no offline queue of their own.

**Technical constraint driving the architecture:** Prisma's query engine is locked to one database provider at build time — a single running server process cannot hot-swap between Postgres and SQLite. This rules out reusing the existing isolated-SQLite mode as the "offline half"; the offline layer has to sit *in front of* Prisma, not inside it.

## Architecture

- **Online (normal) mode:** the standalone Next.js server's `DATABASE_URL` points at production Postgres over the internet, identical to `scripts/local-server/`. Every read/write goes straight to the shared database — no drift, no local mirror.
- **Connectivity watcher:** pings a lightweight health-check endpoint every ~15s and after any failed request. Three consecutive failures → offline mode. One success → online mode. A status indicator is visible in the UI at all times.
- **Offline mode — writes:** new purchases/sales/payments/expenses/cash-up entries go through the same forms/validation as always, but instead of hitting the production API they're appended to a local outbox — a small embedded SQLite file used purely as a durable append-only queue (not a schema mirror). Each queued item gets a provisional reference number (e.g. `PUR-OFFLINE-0001`) and prints immediately, marked "Provisional — pending sync" on the slip.
- **Offline mode — reads:** a small local cache (customer lookups, today's stock, price groups) serves screens that would otherwise go blank. Anything not in the cache falls back to manual entry, same as a new walk-in.
- **Reconnection:** the outbox replays every queued item, in original order, against the real API. The server assigns the real permanent reference number; the provisional slip already handed to the customer stays valid (internally relinked). Anything that fails to replay (e.g. a since-deleted customer) is flagged for manual review, never silently dropped.

## Printer & Cash Drawer

- **Serial/USB:** "Scan for printers" button in Settings lists available COM ports (via `serialport`'s `SerialPort.list()`) in a dropdown, replacing free-text entry. Manual entry stays available as a fallback.
- **Network:** "Scan network" button sweeps the local subnet for anything answering on port 9100, populating a dropdown of found IPs.
- Once selected, everything downstream is unchanged — same `node-thermal-printer` config and `isPrinterConnected()` check already in use.
- **Cash drawer toggle:** new "Cash drawer attached" (yes/no) setting. When off, the app skips `openCashDrawer()` entirely after printing, rather than relying on today's silent-failure safety net.

## Receipt Layout

`thermal.ts` is rebuilt to match the legacy paper layout field-for-field: full address/phone/VAT block, "Done By"/"Scale Op"/"Rep" lines, customer code + VAT number, a Product/InPrice/Gross/Tare/Nett/Total table (gross/tare data already exists in `PurchaseLineSchema`, just wasn't printed before), Nett Total/Total/VAT/Grand Total breakdown, the payment-split/loan-reference line, and a Slip No.

**The legal ownership statement footer (and the sales-receipt "thank you" line) is NOT hardcoded** — it's pulled from `SystemSettings.receiptFooter`, the same setting the PDF slip path already reads. The legacy wording becomes the seeded default value in Settings, fully editable by an admin, not baked into code.

"Scale Op" only appears when the order came through the Scale Station queue-number flow; otherwise it's omitted rather than repeating "Done By". "Rep" has no backing field today and prints blank, matching the legacy sample.

## Code Signing

Deferred per explicit decision — ship unsigned for now (Windows SmartScreen shows an "unrecognized publisher" warning but the app still installs and runs). `electron-builder` already supports Authenticode signing natively via `CSC_LINK`/`CSC_KEY_PASSWORD` env vars once a real certificate is purchased under Golden Key Investments' name — no code changes needed later, just set the two env vars on the build machine.

## Rollout Order

1. Swap Electron's data layer to production Postgres (proven pattern from `scripts/local-server/`).
2. Build the connectivity watcher + local outbox + read cache.
3. Wire provisional reference numbers + reconciliation replay.
4. Rebuild `thermal.ts` to the new layout; move footer text to `SystemSettings.receiptFooter`.
5. Add printer/cash-drawer detection to Settings.
6. Test: pull the network cable mid-transaction, confirm queue/print/reconcile all work; test detection against the real printer.
7. Package an unsigned installer, install on the real till PC, run a real shift on it before retiring the old workflow.
