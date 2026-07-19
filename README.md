<p align="center">
  <img src="assets/brand/svg/logo.svg" alt="Booki" height="56" />
</p>

<h1 align="center">Booki</h1>

<p align="center">
  Smart dock for Windows — apps, folders, live widgets, clipboard history, and a floating notch.
</p>

<p align="center">
  <img src="assets/screenshots/dock.png" alt="Booki Dock on Windows with live widgets and a floating notch" width="920" />
</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest">Download latest installer</a>
  ·
  <a href="https://github.com/punkable/booki/releases">All releases</a>
  ·
  <a href="#gallery">Gallery</a>
</p>

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><img src="https://img.shields.io/github/v/release/punkable/booki?label=latest&style=flat-square" alt="Latest release" /></a>
  <a href="https://github.com/punkable/booki/releases"><img src="https://img.shields.io/github/downloads/punkable/booki/total?label=downloads&style=flat-square" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078d4?style=flat-square" alt="Windows 10/11" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="MIT license" /></a>
</p>

---

## Why Booki

| | |
|---|---|
| **A dock, not a taskbar** | Pin apps, folders, files, pictures and websites. Click to launch or focus an open window. Right-click a pin for recent files. |
| **Arrange everything** | Drag from the desktop to pin, drag out to unpin, drop on the bin to delete, group apps and widgets, reorder on the bar. |
| **Live widgets** | CPU/RAM/disk/battery/volume rings, clock, network, uptime, notes, clipboard history and now-playing — compact cards that do not stretch the dock. |
| **Smart hide + notch** | The dock tucks into a slim notch and comes back when you need it. Stays out of fullscreen games and videos. Notch size is adjustable in Settings. |
| **Precise clicks** | Clicks outside the painted dock pass through to the app behind it. |
| **Fits Windows** | Light/dark/system themes, wallpaper-aware accent, glass materials, size/spacing/radius, multi-monitor, five languages. |
| **Private by design** | No accounts, no telemetry, no cloud sync. Config stays in `%APPDATA%\Booki`. Clipboard memory is opt-in. |
| **Small and native** | Tauri 2 + Rust on system WebView2 — small installer, timers pause when the dock is hidden. |

## What's new in 0.58

- **Settings survive uninstall** — reinstalling Booki keeps `%APPDATA%\Booki` unless you check *Delete app data*.
- **Onboarding stays dismissed** — first-run tips and the Settings intro are persisted; sliders no longer reset them.
- **Fullscreen toast** — the hide message no longer flashes the bare notch pill underneath.
- **Clearer groups** — open/switch flyouts, reorder inside the stack, add apps or folders, running dots on group children.

Older notes live in Settings → What's new.

<a id="gallery"></a>

## Gallery

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
  <sub>The <em>notch</em>: a little glass tab that stays at the taskbar edge while the dock is away.</sub>
</p>

## Install

1. Download `Booki_*_x64-setup.exe` from [Releases](https://github.com/punkable/booki/releases/latest) (per-user, no admin).
2. Run it and launch **Booki** from the Start menu. Tray icon: show/hide, settings, quit.

> **Requires Windows 10/11** — WebView2 is fetched automatically if missing.
>
> **SmartScreen:** this beta is not commercially code-signed yet. If Windows shows *Windows protected your PC*, choose **More info → Run anyway**.

## Gestures

| Gesture | Action |
|---------|--------|
| Click a pin | Launch it (or focus its window) |
| Drag from desktop → dock | Pin an app, folder, file or picture |
| Drag a pin out of the dock | Unpin it |
| **Middle-click** a pin | Open its location in Explorer |
| Right-click the dock | Add apps / widgets / profiles / settings |
| Double-click a widget | Jump to its style editor |
| Mouse wheel over Media (optional) | Raise or lower system volume |
| `Alt` + `1…9` | Launch the Nth pin (modifier is configurable) |
| Push cursor into the screen edge | Reveal a hidden dock |

## Privacy

- Fully offline except: GitHub update checks (signed releases), and favicon fetch if you pin a website. **No telemetry, no accounts, no data collection.**
- Config: `%APPDATA%\Booki\config.json` (plus a `config.bak.json` safety copy). Export/import from Settings anytime.
- Uninstall keeps that folder by default so a reinstall restores your dock. Only the uninstaller checkbox *Delete app data* wipes it.
- Clipboard history is local. Restart memory is **off by default**; when enabled it is protected for your Windows user and can expire.
- Hidden from compatible captures by default; Settings can show the dock/notch in screenshots and recordings.
- In-app updates download the signed installer and keep your settings.
- "Start with Windows" writes `HKCU\…\Run\Booki`; uninstall clears that entry (and Explorer shell verbs) without deleting your config unless you ask.

## Support

Booki is free and open source (MIT), by **[Punkable](https://github.com/punkable)** ([@0xPunki](https://x.com/0xPunki)).

Donations are optional:

| | Network | Address |
|---|---------|---------|
| <img src="assets/brand/svg/bitcoin.svg" alt="Bitcoin" width="28" height="28" /> | **Bitcoin** | `bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3` |
| <img src="assets/brand/svg/solana.svg" alt="Solana" width="28" height="22" /> | **Solana** | `JCRkiVEm5sPBNnna1j16CRu5E4VeNWtoj6TThxmVFB4W` |

Questions or bugs: **[punkable@protonmail.com](mailto:punkable@protonmail.com)** or open an issue. See [SECURITY.md](SECURITY.md) for vulnerabilities.

## Tech stack

| Layer | Tech |
| -------- | ------------------------------------------------------------------ |
| Shell | [Tauri 2](https://tauri.app) (system WebView2) |
| Backend | Rust + [`windows`](https://crates.io/crates/windows) |
| Frontend | Vanilla-JS dock + React settings (Vite) |
| Art | [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) 3D (Microsoft, MIT) |

## Development

> On Linux/macOS you can preview the UI in a browser — the frontend ships demo data without Tauri.

```bash
npm install
npm run dev          # browser preview → http://localhost:1420
npm run tauri:dev    # real app (Windows + Rust + WebView2)
npm run tauri:build  # NSIS installer
```

Releases are built by CI on version tags ([`.github/workflows/release.yml`](.github/workflows/release.yml)).

## License

MIT — do whatever makes you happy; credit is appreciated.

<sub>Emoji artwork: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) © Microsoft, MIT license.</sub>

<p align="center">
  <img src="assets/brand/svg/isotype.svg" alt="Booki the capybara" height="96" /><br/>
  <sub>Made by <a href="https://github.com/punkable">Punkable</a> · <a href="https://x.com/0xPunki">@0xPunki</a></sub>
</p>
