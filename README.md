<p align="center">
  <img src="assets/brand/svg/logo.svg" alt="Booki" height="64" />
</p>

<h1 align="center">Booki Dock</h1>

<p align="center">A modern, lightweight dock for Windows — pin your apps, launch or switch to them with a click, and keep your desktop tidy. Inspired by macOS-style docks like <a href="https://github.com/josejuanqm/docky">Docky</a>, rebuilt for Windows.</p>

<p align="center"><em>Status: early / alpha. Core dock works; see the roadmap below.</em></p>

<p align="center">
  <img src="assets/screenshots/dock.png" alt="Booki Dock preview" width="620" />
</p>

---

## Install

1. Download the latest installer from the
   [**Releases** page](https://github.com/punkable/booki/releases) —
   `Booki_*_x64-setup.exe` (NSIS, recommended) or `Booki_*_x64_en-US.msi`.
   (Every push is also built in [Actions](https://github.com/punkable/booki/actions); release
   builds attach the installers to a downloadable Release.)
2. Run the installer and launch **Booki** from the Start menu.
3. The dock appears at the bottom of your screen; a tray icon gives you show/hide, settings and quit.

> Requires Windows 10/11. The WebView2 runtime ships with Windows 11 and most
> updated Windows 10 installs; the installer fetches it if missing.

## Why Booki Dock

- **Light on resources.** Built with **Tauri 2 + Rust**, using the system **WebView2** — no bundled Chromium. The installer and memory footprint are a fraction of an Electron app.
- **Native where it counts.** App icons, window enumeration and window switching go through the official Win32 bindings (`windows-rs`).
- **Cheerfully branded.** The friendly Booki capybara, rounded glassmorphism and a warm tan accent — fully themeable.

## Features (current)

- **Frameless glass dock** with layered glassmorphism (blur, sheen, reflections), anchored to any screen edge (bottom / top / left / right), always-on-top and hidden from the taskbar.
- **Magnify-on-hover that overflows the bar** — tiles rise *above* the glass capsule like the macOS dock, with adjustable zoom intensity and a spring curve.
- **Launcher + switcher** — pinned apps show their real Windows icons; click launches the app, or, if it's already running, brings its window to the front.
- **Drag programs/folders from the desktop** straight onto the dock to pin them.
- **Drag-to-reorder** tiles with smooth pointer dragging; **separators** to group items.
- **Custom icon override** per tile (pick any image).
- **Auto-hide** — slides away and reveals on edge hover, with a subtle grab handle.
- **System tray** icon → show/hide the dock, open settings, quit.
- **Live settings window** — theme (system/light/dark), accent color, icon size, spacing, translucency, magnification + zoom intensity, labels, running indicators, anchor edge, always-on-top, auto-hide, and full pin management. Changes apply to the dock instantly.
- **Running-app indicators** — a glowing dot under apps that currently have an open window.
- Config persisted as JSON under `%APPDATA%\Booki\config.json`.

## Roadmap

- Live window previews on hover (DWM thumbnails).
- App folders / grouping and a fullscreen Launchpad.
- Themes & profiles, multi-monitor anchoring, AppBar space reservation.
- Widgets, custom icons, global hotkeys, auto-update.

## Tech stack

| Layer    | Tech                                                            |
| -------- | -------------------------------------------------------------- |
| Shell    | [Tauri 2](https://tauri.app) (WebView2)                        |
| Backend  | Rust + [`windows`](https://crates.io/crates/windows) (Win32)   |
| Frontend | Vanilla HTML/CSS/JS (no framework), bundled with Vite          |

## Project layout

```
booki/
├── src/                  # Frontend (WebView2): the dock + settings UI
│   ├── index.html        # dock surface
│   ├── dock.js           # tiles, magnify, drag, launch, context menu
│   ├── settings.html/.js # settings window
│   ├── api.js            # Tauri bridge with browser fallbacks
│   ├── styles.css        # Booki brand tokens + dock styling
│   ├── icons.js          # Lucide-style icons
│   └── theme.js          # accent / theme / edge application
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── lib.rs        # Tauri builder, tray, commands, positioning
│   │   ├── config.rs     # JSON config persistence
│   │   ├── apps.rs       # launching apps
│   │   └── win/          # Win32 integration (icons, window enum/focus)
│   ├── icons/            # app icons (generated from the capybara isotype)
│   └── tauri.conf.json
└── assets/brand/         # Booki brand kit (svg + png)
```

## Development

> **Note:** Booki Dock is a Windows app. The native dock behavior only works on Windows.
> On Linux/macOS you can still preview the **UI** in a browser (the frontend ships
> demo data when the Tauri bridge is absent).

```bash
npm install

# Preview the UI in a browser (mock data, no native features)
npm run dev            # http://localhost:1420

# Run the real app (Windows; requires the Rust toolchain + WebView2)
npm run tauri:dev

# Build installers (.exe / .msi) — Windows
npm run tauri:build
```

CI builds the Windows installers on every push via
[`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml);
download them from the run's **Artifacts**.

## License

MIT
