<p align="center">
  <img src="assets/brand/svg/logo.svg" alt="Booki" height="64" />
</p>

<h1 align="center">Booki Dock</h1>

<p align="center">A modern, lightweight macOS-style dock for Windows — pin your apps, folders, websites and live widgets to a beautiful glass bar that gets out of your way when you work.</p>

<p align="center"><em>Beta — updated often. Only the latest release is kept downloadable; the in-app updater keeps you current.</em></p>

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

---

## Install

1. Download the latest installer from the [**Releases** page](https://github.com/punkable/booki/releases):
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
  drag from the desktop to pin; drag to reorder; right-click for everything else.
- **Live widgets** — clock, CPU, RAM, disk, network, uptime, battery, quick notes
  and a **now-playing music card** (album art + click to play/pause). Every widget
  is visually editable: glass/solid/gradient/outline/minimal, custom colors, animations.
- **Recycle Bin in the dock** — drop files on it, confirm, and they go to the
  Windows Recycle Bin (always recoverable, never a permanent delete).
- **Smart hide + notch** — the dock tucks away when you're working and leaves a
  slim glass tab (the *notch*) blended into the taskbar edge, iPhone-notch style.
  Click it to bring the dock back, or drag it to another screen edge to move the
  whole dock. Fullscreen games and movies black everything out automatically.
- **Folders** — group apps into folders with a clean flyout grid; smart
  suggestions group your installed apps like the Start menu does.
- **Deep customization** — theme (light/dark/system/**auto by time of day**),
  accent color (pick one, use the system's, or take it from your wallpaper),
  icon size/spacing/roundness, translucency, magnify-on-hover, four anchor edges,
  multi-monitor, ES/EN, config export/import, searchable settings.
- **Light on resources** — Tauri 2 + Rust on the system WebView2: a ~4 MB
  installer, tiny memory footprint, and timers that only run while visible.

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

Releases are built and signed by CI on every version bump
([`.github/workflows/release.yml`](.github/workflows/release.yml)); older
releases are pruned so only the latest stays downloadable.

## Credits

Created by **[Punkable](https://github.com/punkable)** ·
[@Punkabl3](https://x.com/Punkabl3) on X. 🦫

## License

MIT
