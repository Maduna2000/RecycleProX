# Renovo Pro Desktop

Installed Windows app for the till/office PC. Talks to production Postgres
directly over the internet when online; queues transactions locally and
auto-syncs when a dropped connection returns (see
`docs/plans/2026-08-01-desktop-hybrid-sync-design.md` for the full design).

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

The installer does **not** bundle production database credentials. After
installing, copy `electron/desktop.env.example` to the app's userData
folder as `desktop.env` (Windows: `%APPDATA%\renovopro\desktop.env`) and
fill in the real values — see that file's own comments for where to find
each one. The app shows a clear "Setup Required" dialog with the exact
expected path if this file is missing or incomplete.

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
