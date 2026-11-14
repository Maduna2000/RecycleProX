# Renovo Pro Desktop

Installed Windows app for the till/office PC. Talks to production Postgres
directly over the internet when online; queues transactions locally and
auto-syncs when a dropped connection returns (see
`docs/plans/2026-08-01-desktop-hybrid-sync-design.md` for the full design).

## System requirements

Windows 10 version 1809 or newer, 64-bit (Electron's own Chromium runtime
requirement) — no separate runtime install needed, Electron bundles its
own. A network path to both the Renovo Pro Portal (activation/licensing)
and the production Postgres database is required for first activation and
for ongoing data sync; short outages after that are absorbed by the
offline queue (see the hybrid-sync design doc above).

## Building

```
npm run build:desktop   # builds .next/standalone against the Postgres client
npm run electron:build  # + packages the Windows installer via electron-builder
```

The older isolated-SQLite build (a fully separate, disconnected local
database, not the shared production one) is still available for reference
via `npm run build:desktop:sqlite` / `scripts/build-desktop.ts` — not used
by the default packaging pipeline.

## First-run setup on the target PC

The installer does **not** bundle production database credentials — but the
operator never has to source or type one either. Entering the one-time
activation code the Portal issues is the only setup step: on success, the
Portal's `POST /api/desktop/activate` response includes a `runtimeConfig`
block, and `electron/main.js` writes `desktop.env` from it automatically
(`writeDesktopEnv()`). No dashboard, no manual file, no production
credential ever passes through a person.

**Credential model (Phase 1 of a planned two-phase rollout):** every device
today still receives the same underlying restricted `app_runtime` Postgres
connection string (never the owner/admin one — see `desktop.env.example`),
just delivered by the Portal instead of copy-pasted from Vercel's dashboard.
A revoked/blocked device stops receiving it on its next heartbeat, but an
already-cached copy on a since-revoked till isn't invalidated until that
shared secret is rotated — full per-device credential isolation (distinct
Postgres roles, instantly revocable) is a deliberately separate, larger
follow-up, not yet built.

**Config refresh while running:** every heartbeat (every 8h) can bring back
an updated `runtimeConfig` — a rotated secret, a reissued token. `desktop.env`
is rewritten on disk immediately either way, but the already-running local
server keeps using what it was started with (no hot-swapping env vars into
a live process) until the operator restarts — a "Restart to apply config"
chip appears in the app header, same soft, never-forced-mid-shift pattern
as the existing app-update chip. This also applies to a revoked device: it
still gets a rewritten (if stale) file rather than silently drifting, and
is never hard-killed mid-shift.

The manual path — copy `electron/desktop.env.example` to
`%APPDATA%\renovopro\desktop.env` and fill in the real values by hand — still
works as a fallback: for `provision-till.ps1`'s network-share pre-seeding,
or a support scenario needing a hand-edited value. The app still shows a
clear "Setup Required" dialog with the exact expected path if activation
hasn't run and no file exists yet.

The installer is **per-machine** (`nsis.perMachine` in `package.json`) and
shows a license/EULA acceptance screen (`electron/LICENSE.txt`) — one
install (with an admin/UAC prompt) covers every Windows account on a
shared till, rather than needing a separate install per login.

### Provisioning many tills at once

The NSIS installer already supports the standard silent flag
(`RenovoProSetup.exe /S`) with no extra configuration. `scripts/desktop/
provision-till.ps1` wraps that plus the `desktop.env` copy step into one
command, for staging a new till from a network share without clicking
through the wizard by hand:

```
.\provision-till.ps1 -InstallerPath \\fileserver\renovopro\RenovoProSetup.exe -DesktopEnvSource \\fileserver\renovopro\desktop.env
```

Device activation (the one-time code from the Portal) is intentionally
**not** automated by this script — it's tied to a specific device/company
pairing and is meant to be entered once by whoever is actually setting up
that till.

## Code signing (not yet configured)

The installer ships **unsigned** today — Windows SmartScreen will show an
"unrecognized publisher" warning on first run, but the app still installs
and runs. `electron-builder` already supports Authenticode signing natively,
and `.github/workflows/build-desktop.yml` already forwards `CSC_LINK` /
`CSC_KEY_PASSWORD` through to the build step — so once a real code-signing
certificate is purchased under Golden Key Investments (Pty) Ltd's name (an
OV or EV certificate from a CA such as DigiCert or Sectigo), turning signing
on is purely a matter of adding two **GitHub Actions repository secrets**
(Settings → Secrets and variables → Actions) — no code or workflow changes
needed:

```
CSC_LINK=<base64-encoded .pfx, or a URL to it>
CSC_KEY_PASSWORD=<the certificate's password>
```

(Building locally instead of via CI works the same way — set the same two
environment variables before running `npm run electron:build`.)

See <https://www.electron.build/code-signing> for the full reference.

## Auto-updates (not yet configured)

The app checks for updates via `electron-updater` (see `main.js`'s
`setupAutoUpdater`) — not against GitHub Releases, since this repo is
private and that method needs a repo-read token baked into every installed
till's app, a real exposure for financial software. Instead it polls this
app's own `GET /api/desktop/update-feed/*` route, which serves files out of
this project's existing (otherwise-private) R2 bucket under a
`desktop-releases/` prefix — `.github/workflows/build-desktop.yml` uploads
the installer, its blockmap, and `latest.yml` there after each build, via
`POST /api/internal/desktop-release` (shared-secret gated the same way as
every other `/api/internal/*` route — see
`src/lib/internal/authorizeInternalRequest.ts`).

This is currently a no-op — like signing, it turns on purely by adding one
more **GitHub Actions repository secret**, no code or workflow changes
needed:

```
DESKTOP_UPDATE_FEED_BASE_URL=<this Web app's own production URL, e.g. https://your-deployment.vercel.app>
```

Until that secret exists, the build still produces a working (if
non-self-updating) installer — updates just silently fail their feed check
on launch and the app carries on normally, the same way an unsigned
installer still runs fine today.

Once configured: updates download automatically in the background (never
disrupts a till mid-shift) and a "Restart to update" chip appears in the
app header when one's ready — installing always waits for that click, or
happens automatically on the next natural full app quit either way.

## Startup reliability

A slow-starting server (cold Prisma engine load, empty disk cache on
first run) and an already-dead one (bad `desktop.env` values, a missing
engine binary, another copy already bound to the port) used to look
identical to the user — both just sat on the same generic "Still
Starting…" retry loop. `main.js` now tells them apart:

- A **branded splash window** (`splash.html`) shows immediately while the
  server is starting, instead of no window at all for up to 30 seconds.
- The port (3100) is checked for availability *before* spawning — a
  leftover process from a previous crash gets its own "Port Already In
  Use" message pointing at Task Manager, not a silent timeout.
- If the spawned server process exits on its own, that's detected
  immediately and reported as "Failed to Start" with the exit code — not
  retried forever against a process that no longer exists.

## Error reporting (partially wired — needs a Portal-side endpoint)

`licenseManager.reportFatalError()` best-effort POSTs a fatal
error/crash (uncaught exception, server-start failure) to
`POST {RENOVO_PORTAL_BASE_URL}/api/desktop/error-report`, the same Portal
every activation/heartbeat call already talks to — so a rollout across
many tills is visible in one place instead of only ever discoverable by
opening one specific machine's local log file
(`%APPDATA%\renovopro\logs\main.log`, always written regardless).

This is the desktop side only. Like signing and auto-updates, it's a
no-op until the matching route is added to the **Portal** (a separate
repo, out of scope here) — until then the POST just 404s and is silently
swallowed, and the local log file remains the source of truth.
