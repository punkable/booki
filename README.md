<p align="center">
  <img src="assets/brand/svg/logo.svg" alt="Booki" height="72" />
</p>

<h1 align="center">Booki Dock</h1>

<p align="center">
  <b>A modern, lightweight macOS-style dock for Windows.</b><br/>
  Pin your apps, folders, files and live widgets to a beautiful glass bar<br/>
  that magnifies on hover and gets out of your way when you work.
</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><img src="https://img.shields.io/github/v/release/punkable/booki?label=release&color=dfaa75&style=flat-square" alt="Latest release" /></a>
  <a href="https://github.com/punkable/booki/releases"><img src="https://img.shields.io/github/downloads/punkable/booki/total?label=downloads&color=b9875f&style=flat-square" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078d4?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/installer-~4%20MB-2ea043?style=flat-square" alt="Installer size" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-302f35?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><b>⬇&nbsp;&nbsp;Download the latest installer</b></a>
</p>

<p align="center">
  <img src="assets/screenshots/dock.png" alt="Booki Dock — a glass bar with apps, live widgets and the Recycle Bin" width="760" />
</p>

---

## ✨ Highlights

| | |
|---|---|
| 🚀 **A dock, not a taskbar** | Pin apps, folders, files, pictures (own thumbnail) and websites (favicon). Click to launch or focus; icons **bounce** as they open. |
| 🖱️ **Drag to organise** | Drag from the desktop to pin, drag out to unpin, drag onto a folder to move a file in, drop on the bin to delete. Group pins into folders. |
| 🎛️ **Live widgets** | Clock, CPU, RAM, disk, network, uptime, battery, notes, **system volume** (scroll = change, click = mute) and a **now-playing card** with album art + transport controls. |
| 🫥 **Smart hide + notch** | Tucks away with a genie animation into a slim glass *notch*; push the cursor to the edge (or click it) to bring it back. Fullscreen games/movies black it out. |
| 🧲 **One control for position** | A single mini-screen sets the dock's edge and the notch's spot at once — the notch always travels with the dock, in a horizontal or slim vertical bar. |
| 💾 **Dock profiles** | Save whole setups (e.g. *Work* / *Gaming*) and switch with one click from Settings or the right-click menu. |
| 🎨 **Deep customization** | Light / dark / system / **auto-by-hour** theme, accent from a palette / system / **your wallpaper**, size, spacing, roundness, translucency, five notch finishes, multi-monitor, ES/EN. |
| 🪶 **Featherweight** | Tauri 2 + Rust on the built-in WebView2 — a ~4 MB installer, tiny memory use, and timers that pause the moment the dock is hidden. |

## 🖼️ Gallery

<table>
  <tr>
    <td width="50%" align="center">
      <img src="assets/screenshots/genie.gif" alt="The dock funnelling into the notch" width="420" /><br/>
      <sub><b>Smart hide</b> — the bar genies into the notch when you start working.</sub>
    </td>
    <td width="50%" align="center">
      <img src="assets/screenshots/folder.gif" alt="A folder flyout opening" width="360" /><br/>
      <sub><b>Folders</b> — group pins and open them in a glass flyout.</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="assets/screenshots/settings.png" alt="The settings window" width="380" /><br/>
      <sub><b>Settings</b> — live preview, visual pickers, searchable.</sub>
    </td>
    <td align="center">
      <img src="assets/screenshots/vertical.png" alt="Booki docked vertically on a side edge" height="230" /><br/>
      <sub><b>Any edge</b> — a slim vertical column on the sides, widgets and all.</sub>
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/screenshots/notch.png" alt="The notch — a slim glass tab blended into the taskbar" width="220" /><br/>
  <sub>The <em>notch</em>: a little glass tab that stays blended into the taskbar edge while the dock is away.</sub>
</p>

## 🚀 Install

1. Download the latest installer from [**Releases**](https://github.com/punkable/booki/releases/latest) —
   `Booki_*_x64-setup.exe` (recommended) or the `.msi`.
2. Run it and launch **Booki** from the Start menu. The dock appears at the bottom
   of the screen; a tray icon gives you show/hide, settings and quit.

> **Requires Windows 10/11** — the WebView2 runtime is fetched automatically if missing.
>
> 🛡️ **SmartScreen note:** this beta isn't signed with a commercial certificate yet, so
> Windows may show *"Windows protected your PC"* — choose **More info → Run anyway**.

## ⌨️ Handy gestures

| Gesture | Action |
|---------|--------|
| Click a pin | Launch it (or focus its window) |
| Drag from the desktop → dock | Pin an app, folder, file or picture |
| Drag a pin out of the dock | Unpin it |
| **Middle-click** a pin | Open its location in Explorer |
| Right-click the dock | Add apps / widgets / profiles / settings |
| Double-click a widget | Jump to its style editor |
| `Alt` + `1…9` | Launch the Nth pin (modifier is configurable) |
| Push cursor into the screen edge | Reveal a hidden dock |

## 🔒 Privacy & security

- Booki runs **fully offline** except for: checking GitHub for updates (signed
  releases), and — only if you pin a website — fetching its favicon. **No
  telemetry, no accounts, no data collection.**
- Everything is stored locally in `%APPDATA%\Booki\config.json`.
- "Start with Windows" writes a single per-user registry entry
  (`HKCU\…\Run\Booki`); the uninstaller removes the app's data folders.
- Deletions from the dock's trash go to the Recycle Bin. If Defender's
  *Controlled folder access* blocks one, allow Booki in Windows Security →
  Ransomware protection — it's a false alarm, Booki never bypasses the bin.

## 💛 A free project, made with love

Booki is **free and open source** (MIT), made with care by
**[Punkable](https://github.com/punkable)** ([@Punkabl3](https://x.com/Punkabl3) on X)
and built with the help of **[Claude Code](https://claude.com/claude-code)**.

If it makes your desktop nicer and you'd like to support development, donations
are welcome — totally optional, thank you 🙏

| | Network | Address |
|---|---------|---------|
| <img src="https://img.shields.io/badge/₿-Bitcoin-f7931a?style=flat-square" alt="Bitcoin" /> | **Bitcoin** | `bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3` |
| <img src="https://img.shields.io/badge/◎-Solana-9945ff?style=flat-square" alt="Solana" /> | **Solana** | `JCRkiVEm5sPBNnna1j16CRu5E4VeNWtoj6TThxmVFB4W` |

## 🛠️ Tech stack

| Layer    | Tech                                                               |
| -------- | ------------------------------------------------------------------ |
| Shell    | [Tauri 2](https://tauri.app) (system WebView2 — no bundled Chromium) |
| Backend  | Rust + [`windows`](https://crates.io/crates/windows) (Win32 / WinRT) |
| Frontend | Vanilla-JS dock + React settings, bundled with Vite                 |
| Art      | [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) 3D (Microsoft, MIT) |

## 👩‍💻 Development

> Booki is a Windows app; on Linux/macOS you can preview the UI in a browser —
> the frontend ships demo data when the Tauri bridge is absent.

```bash
npm install
npm run dev          # browser preview with mock data → http://localhost:1420
npm run tauri:dev    # the real app (Windows, Rust toolchain + WebView2)
npm run tauri:build  # build the installers (.exe / .msi)
```

Releases are built and signed by CI on every version bump pushed to `main`
([`.github/workflows/release.yml`](.github/workflows/release.yml)); older
releases are pruned so only the latest stays downloadable.

## 📄 License

MIT — do whatever makes you happy, credit is appreciated. 🦫

<sub>Emoji artwork: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) © Microsoft, MIT license.</sub>
