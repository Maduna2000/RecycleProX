# Renovo Pro — Local Hardware-Bridge Server

Runs Renovo Pro on a shop-floor PC so its scale/printer API routes can reach
hardware wired to that machine, while all business data still lives in the
one shared production database — this is a plain copy of the same app you'd
get from the production URL, just self-hosted next to the hardware instead
of on Vercel. Install it as a browser PWA and it works exactly like a
desktop app: its own window, its own icon, launches from the Start Menu.

This is a separate, additional way to run Renovo Pro locally — it does not
replace or touch the existing Electron desktop app. Use whichever fits a
given machine; there's no need to have both installed on the same PC.

## One-time setup, per machine

1. **Install Node.js LTS** (x64) from https://nodejs.org/ if it isn't already
   on this PC.

2. **Build and package** (run this on a dev machine, not the shop-floor PC):
   ```
   npm run package:local-server
   ```
   This produces a self-contained folder at `dist/local-server/`. Zip it and
   copy it to the target PC (anywhere — e.g. `C:\RenovoProLocal\`).

3. **Fill in real credentials.** On the target PC, inside the copied folder:
   copy `local-server.env.example` to `local-server.env`, then open it and
   fill in every value under "Load-bearing" — see the comments in that file
   for exactly where each one comes from. This file holds production
   database credentials; treat it like a password.

4. **Register the background task** (run once, in PowerShell, from inside
   the copied folder):
   ```
   .\install-task.ps1
   ```
   This makes the server start automatically at every logon on this
   machine, and restart itself if it ever crashes.

5. **Start it now** without waiting for a logoff/logon:
   ```
   .\launcher.ps1
   ```
   (Leave this running, or close the window — the Scheduled Task will also
   pick it up at the next logon either way. Check `logs\local-server.log`
   if you're not sure it's working.)

6. **Install the PWA.** In Chrome or Edge on that same PC, visit
   `http://127.0.0.1:3200/login` (or whatever port you set), log in with a
   normal Renovo Pro username and password, then click the install icon in
   the address bar (or the browser menu → "Install Renovo Pro"). It now
   opens as its own desktop app.

7. **Configure the scale/printer connection details** the same way you
   always would — Settings → Scales / Printer Settings in the app itself.
   That configuration already lives in the shared database, so it's
   nothing new; it just needs to be correct for whatever hardware is wired
   to *this* machine.

## Notes

- **One machine, one browser tab.** This only works cleanly when the same
  physical PC runs both the server and the browser that installs the PWA —
  browsers only allow installable PWAs over a "secure context" (HTTPS, or
  the special `localhost` exemption). A different PC on the network trying
  to reach this one over its LAN IP won't get an install prompt. In
  practice this matches how the hardware is wired anyway (a scale/printer
  connects to one specific PC).
- **No separate device license.** Unlike the Electron app, there's no
  activation code here — normal login is the only gate, since this shares
  the same live database as production. To cut someone off, disable their
  user account like normal.
- **Uninstalling:** run `.\uninstall-task.ps1` to stop it from starting at
  logon, then delete the folder.
