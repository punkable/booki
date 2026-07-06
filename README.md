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
| 🚀 **A dock, not a taskbar** | Pin apps, folders, files, pictures (own thumbnail) and websites (favicon). Click to launch — or optionally **focus the open window** instead. Right-click a pin for your **recent files**. Icons **bounce** as they open. |
| 🖱️ **Drag to organise** | Drag from the desktop to pin, drag out to unpin, drop on the bin to delete. **Group** apps *and* widgets by dragging one onto another, reorder right on the bar, and drag the empty bar to another edge with a live **anchor-point preview**. |
| 🎛️ **Live widgets, Windows-11 styled** | CPU/RAM/disk/battery/volume as **animated ring gauges**, clock, network, uptime, and **card widgets** with a colored icon + live preview for **notes** and a full **clipboard history** (copy anywhere, right-click → save, reopen to cut/edit/clear). Plus a **now-playing card** with album art + transport controls. Tuck any of them into a **group** — they go live only when you open it. |
| 🗂️ **Apps manager** | A **list *or* grid** view in Settings: open a group to its draggable **squares**, drag to reorder, onto another group, or out to the dock — plus a **General** tab for language, updates and backup. |
| 🗑️ **Recycle Bin** | A bin tile that **shows how many items it holds** and empties (with a confirmation) from its right-click menu. |
| 🫥 **Smart hide + notch** | Tucks away with a genie animation into a slim glass *notch*; push the cursor to the edge (or click it) to bring it back. Fullscreen games/movies black it out. |
| 🧲 **One control for position** | A single mini-screen sets the dock's edge and the notch's spot at once — the notch always travels with the dock, in a horizontal or slim vertical bar. |
| 💾 **Dock profiles** | Save whole setups (e.g. *Work* / *Gaming*) and switch with one click from Settings or the right-click menu. |
| 🎨 **Deep customization** | Light / dark / system / **auto-by-hour** theme, accent from a palette / system / **your wallpaper**, size, spacing, roundness, translucency, five notch finishes, multi-monitor and **6 languages**. |
| 🔒 **Private by design** | No accounts, no telemetry, nothing phones home. A built-in **Help & FAQ** tab explains exactly what touches your PC. |
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
   `Booki_*_x64-setup.exe` (per-user, no admin needed).
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
- **Updates** are delivered in-app: Booki checks the latest GitHub release,
  downloads the **signed** installer, updates itself in place for your user and
  **keeps your settings**. You can also check manually in *Settings → About*.
- "Start with Windows" writes a single per-user registry entry
  (`HKCU\…\Run\Booki`); the uninstaller removes the app's data folders.
- Deletions from the dock's trash go to the Recycle Bin. If Defender's
  *Controlled folder access* blocks one, allow Booki in Windows Security →
  Ransomware protection — it's a false alarm, Booki never bypasses the bin.

## 💛 A free project, made with love

Booki is **free and open source** (MIT), made with care by
**[Punkable](https://github.com/punkable)** ([@0xPunki](https://x.com/0xPunki) on X).
Built with [Tauri 2](https://tauri.app) + Rust, and developed with the help of
AI tooling ([Claude Code](https://claude.com/claude-code)) under human direction and testing.

If it makes your desktop nicer and you'd like to support development, donations
are welcome — totally optional, thank you 🙏

| | Network | Address |
|---|---------|---------|
| <img src="assets/brand/svg/bitcoin.svg" alt="Bitcoin" width="28" height="28" /> | **Bitcoin** | `bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3` |
| <img src="assets/brand/svg/solana.svg" alt="Solana" width="28" height="22" /> | **Solana** | `JCRkiVEm5sPBNnna1j16CRu5E4VeNWtoj6TThxmVFB4W` |

Questions, ideas or bug reports? Email **[punkable@protonmail.com](mailto:punkable@protonmail.com)**
or open an issue — see [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

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
npm run tauri:build  # build the NSIS installer (.exe)
```

Releases are built and signed by CI on every version bump pushed to `main`
([`.github/workflows/release.yml`](.github/workflows/release.yml)); older
releases are pruned so only the latest stays downloadable.

## 📄 License

MIT — do whatever makes you happy, credit is appreciated. 🦫

<sub>Emoji artwork: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) © Microsoft, MIT license.</sub>

<p align="center">
  <img src="assets/brand/svg/isotype.svg" alt="Booki the capybara" height="96" /><br/>
  <sub>Made with 🧡 by <a href="https://github.com/punkable">Punkable</a> · <a href="https://x.com/0xPunki">@0xPunki</a></sub>
</p>
