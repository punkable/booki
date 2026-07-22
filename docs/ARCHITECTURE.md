# Booki Dock — Architecture & developer guide

A modern, lightweight **dock for Windows** (macOS-dock-style launcher). Booki keeps
the **brand** (capybara logo, tan accent). It is local-first: no accounts, no telemetry.

## Stack

- **Shell:** Tauri 2 (system WebView2 — no bundled Chromium).
- **Backend:** Rust + the official `windows` crate (Win32) for native dock behavior.
- **Frontend:** Vite. Dock / notch are vanilla JS; Settings is React 19 + Fluent UI.

## Layout

```
src/
  index.html  dock.js     # dock surface (tiles, magnify, drag, smart-hide, stacks)
  notch.html  notch.js    # floating notch window when the dock is tucked
  settings.html settings.jsx  # Settings (React)
  api.js                  # Tauri bridge + browser demo fallbacks
  pins.js                 # shared pin/group merge + normalize helpers
  surface.js              # unified mica/acrylic/tinted/solid finish
  styles.css  i18n.js     # design tokens + copy
src-tauri/
  src/lib.rs              # commands, tray, window positioning, occlusion
  src/config.rs           # %APPDATA%\Booki\config.json (+ .bak)
  src/win/                # Win32 impl + stub
  installer/hooks.nsh     # NSIS: preserve AppData unless Delete app data
assets/brand/             # brand kit — do not delete casually
```

## Key conventions

- **Frontend ↔ backend** only through commands in `src-tauri/src/lib.rs`, wrapped in
  `src/api.js` (with `mockInvoke` fallbacks for `npm run dev` in a browser).
- **Native code is Windows-only** (`windows_impl.rs` / `stub.rs`).
- **Brand tokens** in `styles.css` `:root` (`--booki-tan`, etc.). Prefer calm Fluent-like
  surfaces over decorative glass.
- **Clipboard history** is opt-in; never log clipboard contents.

## Config (high level)

Persisted at `%APPDATA%\Booki\config.json` (camelCase via serde). Important keys:

- `pinned[]` — apps, folders, groups (`children`), widgets, separators, trash
- `surfaceStyle` — `mica` | `acrylic` | `tinted` | `solid` (dock + notch)
- `autoHideMode` — `off` | `smart` | `edge`
- `hideInFullscreen` — black out dock + notch during fullscreen apps (default true)
- `notchMode` — `attached` | `floating` | `smart` (legacy `notchPeek` kept in sync)
- `notchScale`, `notchTrigger`, `notchAlwaysVisible`
- `onboarded`, `settingsIntroSeen`, `seenVersion`

Uninstall keeps this folder by default; only the NSIS *Delete app data* checkbox wipes it.

## Smart-hide

The stage window is large (bar + flyout headroom). Occlusion uses a **bar-only home
rect** from `set_dock_frame(..., homeWidth, homeHeight)` so unrelated windows over the
flyout zone do not tuck the dock. Hit-testing is click-through outside reported rects.

## Build & verify

```bash
npm install
npm run check:text
npm run check:icons
npm run build
npm run dev          # browser preview
npm run tauri:dev    # real app (Windows)
npm run tauri:build  # NSIS + MSI
```

Releases: tag `v*` → `.github/workflows/release.yml`.
