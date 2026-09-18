# TradeVault — Desktop (Electron) Edition

## What's new in this build

- **Setup list updated** — `renderer/index.html`'s default Setup dropdown now matches your latest list: `V-C-P`, `C-&-H`, `H-&-S`, `EMAPB`, `HADOJI`, `MPAUSE`, `MBRUST`, `HTFLAG`, `PENANT`, `MACROS`. (This only affects brand-new installs with no saved data — your existing Setup list on disk is untouched.)
- **Renamed labels**: `Avg (R)` → `Average (R)`; `CMP` → `LTP ₹` everywhere it appeared (column headers, the Open Trades modal, exports, the Refresh button, and the help tab).
- **Renamed the underlying field too**, not just the label: `cmp` → `ltp` in the code and in your saved data. A one-time migration runs automatically the first time you open this build — it copies your existing `cmp` values over to `ltp` so none of your live prices are lost, then saves in the new format from then on.
- **New: Allocation %** in the Open Trades header — shows your total Invested across every open position as a % of your live Current Capital, recalculated every time the screen renders (unlike POS %, which is frozen per-position at entry). Colored green under 60%, amber 60–90%, red above 90%.
- **Fixed a misleading-zero bug**: `LTP ₹`, `Net P/L`, `P/L %` and `R-Mult` used to silently fall back to showing your entry price as if it were the live price whenever no live price had actually been fetched yet — making it look like P/L was genuinely `0` when it was really just missing data. They now show `—` until a position has a real LTP (via Refresh LTP or typed in manually), so a `0` you see going forward is a real zero.
- **Refresh LTP is now honest about failures** — the "LTP ₹ as of …" timestamp in the header only updates when at least one symbol's price actually came back successfully, instead of stamping a time even when every fetch failed.

**Reminder:** Refresh LTP only works when running as the actual installed/dev Electron app (`npm start` or the built `.exe`) — Yahoo Finance blocks the request with a CORS error if you ever open `renderer/index.html` directly in a browser instead.


This is the desktop version of your trading journal. Same app, same features, same
calculations as the HTML version — but it now runs as a real installed Windows program
and saves your data to a proper SQLite database file on your computer instead of a
browser.

## ⚠️ Important if you already tested a previous version

This update renames the app from "AKS Trade Journal" to "TradeVault," which changes
where Windows stores its data — from `%APPDATA%\aks-trade-journal\` to
`%APPDATA%\TradeVault\`. If you already logged real or test trades in the app
before this rename, **they won't automatically appear** after this update, because
the app now reads from a different folder.

**Before running this updated version, export a backup from your old one:**
1. Open your current running app → Configuration → Data & Backup → **Export Backup**
2. Save that `.json` file somewhere you'll find it
3. Then run this updated version (`npm start` or the new installer)
4. Once it opens, go to Configuration → Data & Backup → **Import Backup** and
   select that file — all your trades come back exactly as they were

This is a one-time step caused specifically by this rename; it won't happen again
for future updates.

## What changed vs the HTML version

- **Storage**: was browser localStorage → is now a SQLite database file at
  `%APPDATA%\TradeVault\tradevault.db` (Windows). SQLite uses
  write-ahead logging (WAL mode), which is specifically designed to survive crashes
  and power loss mid-write without corrupting your data — a real upgrade over a
  single JSON blob.
- **No more "Connect Backup File" button** — that existed to work around browser
  limitations. A desktop app doesn't have that problem; it always saves directly to
  its own file, automatically, with no permission prompts.
- **Export Backup / Import Backup** — still there, now using native Windows file
  dialogs instead of browser downloads.
- **Everything else** — every calculation, every screen, every button, is the exact
  same code as your HTML version. Nothing about how the app works day-to-day has
  changed.

## One-time setup (only needed once, on your development machine)

You need [Node.js](https://nodejs.org) installed (the LTS version). Then, in this
folder, open a terminal (Command Prompt / PowerShell) and run:

```
npm install
```

This downloads Electron, electron-builder, and better-sqlite3 (the database
library). It may take a few minutes the first time.

**Note on better-sqlite3:** it contains native code that must match your Electron
version. If `npm install` finishes but the app fails to start with an error
mentioning `better_sqlite3.node` or "was compiled against a different Node.js
version", run:

```
npm run rebuild
```

then try again.

## Running the app during development

```
npm start
```

This opens the app in its own window immediately — no build step needed for this.
Use this to try it out or make further tweaks.

## Building a real installer (.exe)

```
npm run build
```

This produces a Windows installer inside the `dist` folder (something like
`TradeVault Setup 1.0.0.exe`). Run that installer like any normal
downloaded program — it installs to Program Files, adds a Start Menu entry and
desktop shortcut, and from then on you launch it just like any other app.

## Bringing your existing data over

Your existing HTML version has an **Export Backup** button
(Configuration → Data & Backup). Use it to save a `.json` backup file. Then, once
the desktop app is installed and running, use its own **Import Backup** button and
select that same file — all your trades, open positions, strategies and setups
come across exactly as they were.

## Setting up auto-update

The app now checks for new versions automatically and installs them in the
background — you'll just get a small "Update Ready, restart now or later" prompt
when one's available. This uses **GitHub Releases** as the free hosting location
for new versions (no server to run or pay for).

### One-time setup

1. **Create a GitHub account** if you don't have one (free) at github.com.
2. **Create a new repository** for this app — it can be **private**, that's fine,
   auto-update works the same either way. Name it anything, e.g. `aks-trade-journal`.
3. Open `package.json` in this project and find this section near the bottom:
   ```json
   "publish": {
     "provider": "github",
     "owner": "YOUR_GITHUB_USERNAME",
     "repo": "YOUR_REPO_NAME"
   }
   ```
   Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username, and
   `YOUR_REPO_NAME` with the repository name you just created.
4. **Create a GitHub Personal Access Token** (this lets your computer upload
   releases): GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token → tick the `repo` scope → Generate.
   Copy the token somewhere safe (you won't see it again).
5. Set that token as an environment variable before publishing. In PowerShell:
   ```
   $env:GH_TOKEN="paste_your_token_here"
   ```
   (You'll need to set this again each time you open a new terminal window to
   publish a release — or add it to your system's permanent environment variables
   if you don't want to repeat this.)

### Publishing an update (every time after that)

Whenever I (or you) make a change to the app:

1. Bump the version number in `package.json`, e.g. `"version": "1.0.1"`.
2. Run:
   ```
   npm run publish
   ```
   This builds the installer **and** uploads it straight to your GitHub
   repository's Releases page automatically.
3. That's it. Anyone already running an older version of the app will be offered
   the update automatically within a few hours (or immediately on their next
   app launch).

### Important notes

- **The very first install** always has to be done manually (send them the
  installer, or a download link) — auto-update only kicks in for versions
  *after* that first one, since the app needs to already be running to check for
  updates.
- **Auto-update does nothing while running via `npm start`** (development mode) —
  it only activates in the properly built and installed version. This is normal
  and expected, not a bug.
- If you'd rather not use GitHub at all, auto-update can instead point at any
  plain web server/static file host (`"provider": "generic"` with a URL) — let me
  know if you'd prefer that route and I'll reconfigure it.

## Fonts & Excel export — offline status

`renderer/index.html` already references both of these as local files, not CDN links:
```html
<link rel="stylesheet" href="fonts.css">
<script src="lib/xlsx.full.min.js"></script>
```
So as long as `renderer/fonts.css` and `renderer/lib/xlsx.full.min.js` actually exist alongside `index.html` (make sure both are present when copying the renderer folder around), the app should already be fully offline-capable — no internet needed on launch or for Excel export. If either file is missing, those two links will fail silently and you'll be back to needing a connection for that piece.

## Project structure

```
tradevault/
├── main.js          — Electron's main process: creates the window, runs the
│                       SQLite database, handles backup file dialogs
├── preload.js        — the narrow, secure bridge between the app's UI and main.js
├── package.json       — dependencies and build configuration
└── renderer/
    └── index.html      — the entire app UI and logic (same as your HTML version,
                           with the storage layer swapped to talk to main.js)
```

**Note:** this delivered package doesn't include a `build/icon.ico` file, since it wasn't part of what was shared for this update. `main.js` and `package.json` both reference `build/icon.ico` for the window/taskbar icon and the installer icon — drop your existing `build` folder (the one you already have locally, which "must not be deleted") into this project root before running `npm start` or `npm run build`, otherwise the window/installer icon will be missing.
