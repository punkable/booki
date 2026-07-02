<p align="center">
  <img src="assets/brand/svg/logo.svg" alt="Booki" height="64" />
</p>

<h1 align="center">Booki Dock</h1>

<p align="center">A modern, lightweight macOS-style dock for Windows — pin your apps, folders, websites and live widgets to a beautiful glass bar that gets out of your way when you work.</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><img src="https://img.shields.io/github/v/release/punkable/booki?label=release&color=dfaa75" alt="Latest release" /></a>
  <a href="https://github.com/punkable/booki/releases"><img src="https://img.shields.io/github/downloads/punkable/booki/total?label=downloads&color=b9875f" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-0078d4" alt="Platform" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-302f35" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><b>⬇ Download the latest installer</b></a>
</p>

---

<p align="center">
  <img src="assets/screenshots/dock.png" alt="Booki Dock — the bar with apps, widgets and the trash pin" width="720" />
</p>

<p align="center">
  <img src="assets/screenshots/genie.gif" alt="The dock tucking away toward the notch" width="480" /><br/>
  <sub>Smart hide: the dock funnels into the notch when you start working.</sub>
</p>

<p align="center">
  <img src="assets/screenshots/folder.gif" alt="Folder flyout opening" width="405" />
  <img src="assets/screenshots/settings.png" alt="Settings window" width="300" />
</p>

<p align="center">
  <img src="assets/screenshots/notch.png" alt="The notch — a slim glass tab blended into the taskbar" width="220" /><br/>
  <sub>The <em>notch</em>: when the dock tucks away, this little glass tab stays blended into the taskbar edge.</sub>
</p>

## Install

1. Grab the latest installer from [**Releases**](https://github.com/punkable/booki/releases/latest):
   `Booki_*_x64-setup.exe` (recommended) or the `.msi`.
2. Run it and launch **Booki** from the Start menu. The dock appears at the bottom
   of the screen; a tray icon gives you show/hide, settings and quit.

> Requires Windows 10/11 (the WebView2 runtime is fetched automatically if missing).
>
> **SmartScreen note:** the beta isn't signed with a commercial certificate yet, so
> Windows may show "Windows protected your PC" — choose *More info → Run anyway*.

## What it does

- **Dock, not a taskbar** — pin apps, folders, files, pictures (with their own
  thumbnail) and websites (with their favicon). Click launches or focuses;
  drag from the desktop to pin; drag out to unpin; position hotkeys (Alt+1…9).
- **Live widgets** — clock, CPU, RAM, disk, network, uptime, battery, quick notes
  and a **now-playing media card** (album art + prev/play/next controls). Every
  widget is visually editable: glass/solid/gradient/outline/minimal, colors, animation.
- **Recycle Bin in the dock** — drop files on it, confirm, and they go to the
  Windows Recycle Bin (always recoverable). Drop files on a folder pin to move
  them there (undoable with Ctrl+Z).
- **Smart hide + notch** — the dock tucks away with a genie animation and leaves
  a slim glass tab (the *notch*) blended into the taskbar edge, iPhone-notch
  style. Five notch finishes (island, liquid glass, mica, acrylic, Windows), any
  edge, any position. Fullscreen games and movies black everything out.
- **Deep customization** — light/dark/system/**auto-by-hour** theme, accent from
  a palette, the system or **your wallpaper**, icon size/spacing/roundness,
  translucency, magnify-on-hover, four anchor edges, multi-monitor, ES/EN,
  searchable settings, config export/import (with path reassignment when a
  program lives somewhere else on the new PC).
- **Light on resources** — Tauri 2 + Rust on the system WebView2: a ~4 MB
  installer, tiny memory footprint, timers that only run while visible.

## Privacy & security

- Booki runs **fully offline** except for: checking GitHub for updates (signed
  releases), and — only if you pin a website — fetching its favicon through
  Google's favicon service. No telemetry, no accounts, no data collection.
- Everything is stored locally in `%APPDATA%\Booki\config.json`.
- "Start with Windows" writes a single per-user registry entry
  (`HKCU\...\Run\Booki`); the uninstaller removes the app's data folders.
- Deletions from the dock's trash go to the Recycle Bin. If Defender's
  *Controlled folder access* blocks one, allow Booki in Windows Security →
  Ransomware protection (it's a false alarm — Booki never bypasses the bin).

## A free project, made with love 💛

Booki is **free and open source** (MIT), made with care by
**[Punkable](https://github.com/punkable)** ([@Punkabl3](https://x.com/Punkabl3) on X)
and built with the help of **[Claude Code](https://claude.com/claude-code)**.

If you enjoy it and want to support development, donations are welcome — totally optional:

| | Network | Address |
|---|---------|---------|
| ₿ | **Bitcoin** | `bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3` |
| ◎ | **Solana** | `JCRkiVEm5sPBNnna1j16CRu5E4VeNWtoj6TThxmVFB4W` |

## Tech stack

| Layer    | Tech                                                          |
| -------- | ------------------------------------------------------------- |
| Shell    | [Tauri 2](https://tauri.app) (WebView2)                        |
| Backend  | Rust + [`windows`](https://crates.io/crates/windows) (Win32/WinRT) |
| Frontend | Vanilla JS dock + React settings, bundled with Vite            |

## Development

> Booki Dock is a Windows app; on Linux/macOS you can preview the UI in a
> browser (the frontend ships demo data when the Tauri bridge is absent).

```bash
npm install
npm run dev          # browser preview with mock data → http://localhost:1420
npm run tauri:dev    # real app (Windows, Rust toolchain + WebView2)
npm run tauri:build  # build the installers (.exe / .msi)
```

Releases are built and signed by CI on every version bump pushed to `main`
([`.github/workflows/release.yml`](.github/workflows/release.yml)); older
releases are pruned so only the latest stays downloadable.

## License

MIT — do whatever makes you happy, credit is appreciated. 🦫

Emoji artwork: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) © Microsoft, MIT license.
