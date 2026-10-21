<p align="center">
  <img src="assets/brand/svg/isotype.svg" alt="Booki capybara" height="84" />
</p>

<h1 align="center">Booki</h1>

<h3 align="center">Your desktop, calmer.</h3>

<p align="center">A beautiful dock for Windows 11 — apps, folders and live widgets in one calm bar.<br/>Free, private and open source.</p>

<!-- booki:download:start -->
<p align="center">
  <a href="https://github.com/punkable/booki/releases/download/v0.95.0/Booki_0.95.0_x64-setup.exe"><b>Download for Windows v0.95.0 (x64)</b></a> ·
  <a href="https://github.com/punkable/booki/releases/download/v0.95.0/Booki_0.95.0_arm64-setup.exe">ARM64</a> ·
  <a href="https://github.com/punkable/booki/releases/download/v0.95.0/Booki_0.95.0_x64_en-US.msi">MSI x64</a> ·
  <a href="docs/releases/v0.95.0.md">What's new v0.95.0</a> ·
  <a href="README.es.md">Español</a>
</p>
<!-- booki:download:end -->

<p align="center">
  <a href="https://github.com/punkable/booki/releases/latest"><img src="https://img.shields.io/github/v/release/punkable/booki?label=latest&style=flat-square&color=dfaa75" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078d4?style=flat-square" alt="Windows 10 and 11" />
  <img src="https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React-24c8db?style=flat-square" alt="Built with Tauri 2 and React" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center"><img src="docs/presentation/hero-en.jpg" width="1000" alt="Booki dock with example apps, a group, clock, system readings, focus timer and Collector" /></p>

<table align="center">
<tr>
<td align="center" width="25%"><b>⚡ Light</b><br/><sub>Native Rust core. Widgets pause when the dock hides.</sub></td>
<td align="center" width="25%"><b>🔒 Private</b><br/><sub>No accounts, no telemetry, no cloud.</sub></td>
<td align="center" width="25%"><b>🎨 Yours</b><br/><sub>Taskbar, glass or solid. Any edge. Five languages.</sub></td>
<td align="center" width="25%"><b>🧡 Open</b><br/><sub>MIT licensed. Built in the open.</sub></td>
</tr>
</table>

---

<h2 align="center">The notch that tells you things.</h2>

<p align="center">A quiet dot at the top of your screen that opens into a capsule for your focus timer, the song that's playing or a low battery.<br/>Hover it for a card with more. Prefer something simpler? Choose an attached tab or a floating pill.</p>

<p align="center"><img src="docs/presentation/island-en.jpg" width="1000" alt="Claude Code, Cursor and Codex with working, waiting and finished states in the compact Booki notch" /></p>

<h2 align="center">Groups that look like yours.</h2>

<p align="center">Pin apps, folders, files and websites, then gather them into groups.<br/>Give each group a colour from a curated palette and an icon from the library — it shows in the dock and in Settings.</p>

<p align="center"><img src="docs/presentation/groups-en.jpg" width="1000" alt="Booki group flyout with search, selectable density and example app icons" /></p>

<h2 align="center">Live, at a glance.</h2>

<p align="center">Clock, calendar, weather, system (CPU, memory, disk, network), battery, media, volume, notes, clipboard and focus (timer + tasks).<br/>Compact tiles that sit right on the bar.<br/>A focus block turns on Windows Do not disturb (and turns it back off when it ends), holds Booki's own notices and can keep the dock tucked away.</p>

<p align="center"><img src="docs/presentation/widgets-en.jpg" width="1000" alt="Booki live widget panel and Collector session queue" /></p>

<h2 align="center">Settings you actually enjoy.</h2>

<p align="center">Six clear sections — Home, Dock, Widgets, Apps, Plugins and System — with a live preview of your dock and everything at a glance.</p>

<p align="center"><img src="docs/presentation/settings-en.jpg" width="1000" alt="Current Booki Settings home with example dock" /></p>

<h2 align="center">At home in the dark.</h2>

<p align="center">Follows your Windows theme and accent. Match the taskbar, blur what's behind with glass, or stay solid.<br/>When a game or video goes fullscreen, Booki steps aside.</p>

<p align="center"><img src="docs/presentation/dark-en.jpg" width="1000" alt="Current Booki Dock settings in dark mode" /></p>

---

<h2 align="center">Private by design.</h2>

<p align="center">No accounts. No telemetry. No cloud sync. Your tasks, notes and usage stay on your PC.<br/>Weather asks only for the city you choose — never your location.</p>

<!-- booki:media:start -->
<p align="center"><sub>Source frontend captures for v0.95.0, with example data. Native Windows blur requires an in-app check.</sub></p>
<!-- booki:media:end -->

<!-- booki:news:start -->
## What's new in 0.95.0

A smoother Booki: clearer groups, a quieter notch and a fuller Collector.

- Search inside groups and switch between list, small, medium or large icons with Ctrl + wheel. Reorganizing retains search, view and scroll.
- Dragging from a group shows its icon or initial, name, destination and insertion marker. Escape cancels. Drag the dock background to change edge or screen.
- Three optional starting styles, smooth scrolling and restrained motion. New installations and presets start with an idle dot; existing saved preferences are retained.
- Agents show just logo and status, rotating with activity while waiting and errors take priority. Music appears briefly; hover still offers playback controls while an agent works.
- One panel brings your live widgets together. The menu and launcher expose audio controls and quick actions. Device details show source and query time; AI usage without a published allowance is marked approximate.
- Video, audio, files and galleries are explicit. Add multiple links to a session queue, cancel or retry, choose quality and folder, then open, reveal or copy the saved file, including from the notch notice.
- Booki updates are announced discreetly beside the dock. Download and installation remain separate, with settings saved and backed up before applying.

[Full release notes](docs/releases/v0.95.0.md)
<!-- booki:news:end -->

## Get started

1. Open [Releases](https://github.com/punkable/booki/releases/latest) and pick `Booki_*_x64-setup.exe` (Intel/AMD) or `Booki_*_arm64-setup.exe` (Windows on ARM). An x64 MSI is also available.
2. Launch **Booki** from the Start menu. The installer is per-user and fetches WebView2 if it's missing.
3. Drag an app or folder onto the dock, or right-click the dock to add items.

Booki needs Windows 10 or 11. The installer isn't Authenticode-signed yet, so SmartScreen may warn you. Updates are signature-checked and keep your settings. The new background updater applies to the registered per-user setup installation; MSI/portable copies should use the same installer type from Releases.

<!-- booki:history:start -->
## Recent updates

| Version | What changed |
|---|---|
| [0.94.0](docs/releases/v0.94.0.md) | More flexible groups, clearer widgets and a refreshed README. |
| [0.93.0](docs/releases/v0.93.0.md) | Clearer agents, downloads that preserve your files and up-to-date releases. |
| [0.92.0](docs/releases/v0.92.0.md) | Claude and Codex in the notch, focus with Do not disturb, and automatic backup. |

[All published releases](https://github.com/punkable/booki/releases)
<!-- booki:history:end -->

## Everyday controls

| Action | Result |
|---|---|
| Click a pin | Launch it or focus its window |
| Drag desktop → dock | Pin an app, folder, file or image; ordinary pinning preserves the original |
| Drag a pin out | Unpin, or return a shortcut to the desktop |
| Right-click the dock | Add items, choose a profile or open Settings |
| Middle-click a pin | Reveal its location in Explorer |
| Double-click a widget | Open its configuration; utility widgets open their own panel |
| `Ctrl` + wheel inside a group | Switch between list and icon sizes |
| Drag from a group | See the shortcut and destination; `Escape` cancels |
| Widget panel / Audio controls | Available from the menu and action search |
| `Alt` + `1…9` | Launch the corresponding pin; the modifier is configurable |
| Push the cursor to the edge | Reveal a hidden dock when edge/hover behavior is enabled |
| Wheel over Media, if enabled | Change system volume |
| Hover a widget | Its hint lists the details (every device's battery, every AI usage window and when it resets) |

Collector supports video, audio, files and galleries: paste one link per line to queue several. Its gear opens folder, format and quality preferences, also available in Widgets and Plugins. The queue and results last until Booki closes.

## Privacy and your data

- No telemetry, accounts or cloud synchronization. Configuration lives at `%APPDATA%\Booki\config.json`, with a safety backup.
- Network requests are limited to update checks/downloads and website favicons, plus features you explicitly enable: Open-Meteo weather after choosing a city (never your device location), plugin downloads from their official release pages (each checked against a SHA-256 checksum pinned in Booki's source). The AI usage widget makes no network requests.
- The AI usage widget only reads the local usage logs of Claude Code (`~/.claude/projects`) and Codex (`~/.codex/sessions`), read-only, when the widget or local usage notices are enabled. Booki never reads, uses, stores or sends your Claude or ChatGPT credentials, keeps no message content, and makes no network request for it. Claude's local logs hold no plan limits, so the widget shows tokens in the current 5-hour block and this week; Codex's logs include its plan percentages.
- Device batteries come from Windows itself, from Logitech receivers over USB, and, if you installed it, from HeadsetControl running on your PC. Nothing leaves your computer.
- Plugins live in `%LOCALAPPDATA%\Booki\plugins`; removing one in Settings deletes its folder. They are independent third-party tools under their own licenses, installed only when you choose to; you are responsible for using them lawfully. See the [terms of use](TERMS.md).
- App recommendations read Windows' local usage record and local successful Booki launches (`app-usage.json`). Usage is not uploaded.
- Clipboard history is local. Restart persistence is off by default; when enabled, it is protected for your Windows user and can expire.
- Compatible captures hide the dock by default. Enable **Visible in captures** in Settings when recording it.
- Uninstall preserves settings unless you select **Delete app data**. Normal uninstall removes the startup entry and Explorer shell actions.

## Support

Booki is free and open source (MIT), by **[Punkable](https://github.com/punkable)** ([@0xPunki](https://x.com/0xPunki)).

Donations are optional:

| | Network | Address |
|---|---------|---------|
| <img src="assets/brand/svg/bitcoin.svg" alt="Bitcoin" width="28" height="28" /> | **Bitcoin** | `bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3` |
| <img src="assets/brand/svg/solana.svg" alt="Solana" width="28" height="22" /> | **Solana** | `JCRkiVEm5sPBNnna1j16CRu5E4VeNWtoj6TThxmVFB4W` |

Questions or bugs: **[punkable@protonmail.com](mailto:punkable@protonmail.com)** or open an issue. See [SECURITY.md](SECURITY.md) for vulnerabilities.

## Development

Booki uses Tauri 2, Rust/Win32, a vanilla JavaScript dock and React settings, built with Vite. Linux/macOS can preview the frontend with sample data; native behavior requires Windows and WebView2.

```bash
npm ci
npm run dev          # browser preview at http://localhost:1420
npm run check:all    # contracts, build and functional tests
npm run tauri:dev    # native app on Windows with Rust installed
npm run tauri:build  # Windows packages
```

UI changes follow the [visual identity and design system](docs/brand/README.md).

The images and film are rebuilt from the real frontend by [tools/presentation](tools/presentation/README.md); finished media live in `docs/presentation/`. Older native Windows captures and PNG brand exports are kept in `docs/`.

To audit the current public release without running its installers:

```bash
node scripts/audit-release.mjs /absolute/path/to/release-audit
```

This downloads the public assets, checks GitHub hashes, verifies updater signatures using Booki's configured public key, and validates the manifest and installer containers. It does not verify Windows runtime behavior or Authenticode.

Releases are built from version tags through [release.yml](.github/workflows/release.yml). Publishing requires the complete signed updater asset set and matching versions. The workflow uploads and re-downloads the draft assets for integrity checks before publication, preserving older releases for rollback.

## License and credits

[MIT](LICENSE) · [Terms of use and plugin notice](TERMS.md). Booki by [Punkable](https://github.com/punkable) · [@0xPunki](https://x.com/0xPunki).

Emoji artwork: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) © Microsoft, MIT. AI provider logos: [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT); the marks belong to their owners. Device glyphs: [Lucide](https://lucide.dev/) (ISC). Optional city weather: [Open-Meteo](https://open-meteo.com/). The presentation uses the official Booki logo, [Inter](tools/presentation/fonts/OFL.txt) under the SIL Open Font License, and no third-party music. See the [visual identity guidelines](docs/brand/README.md).

### Quality and design

See the [CoolDock research and design decisions](docs/research/cooldock.md) and [premium workspace implementation, measurements and verification limits](docs/quality/premium-workspace.md).
