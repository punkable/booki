<p align="center">
  <img src="assets/brand/svg/isotype.svg" alt="Booki capybara" height="84" />
</p>

<h1 align="center">Booki</h1>

<h3 align="center">Your desktop, calmer.</h3>

<p align="center">A beautiful dock for Windows 11 — apps, folders and live widgets in one calm bar.<br/>Free, private and open source.</p>

<!-- booki:download:start -->
<p align="center">
  <a href="https://github.com/punkable/booki/releases/download/v0.98.0/Booki_0.98.0_x64-setup.exe"><b>Download for Windows v0.98.0 (x64)</b></a> ·
  <a href="https://github.com/punkable/booki/releases/download/v0.98.0/Booki_0.98.0_arm64-setup.exe">ARM64</a> ·
  <a href="https://github.com/punkable/booki/releases/download/v0.98.0/Booki_0.98.0_x64_en-US.msi">MSI x64</a> ·
  <a href="docs/releases/v0.98.0.md">What's new v0.98.0</a>
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
<td align="center" width="25%"><b>🪟 Native</b><br/><sub>Windows 11 acrylic, light and dark. Any edge.</sub></td>
<td align="center" width="25%"><b>🧡 Open</b><br/><sub>MIT licensed. Built in the open.</sub></td>
</tr>
</table>

<p align="center"><img src="docs/presentation/diagram-anatomy.svg" width="960" alt="The parts of Booki: the notch at the top, a widget panel, and the dock with apps, groups and live widgets" /></p>

---

<h2 align="center">Smooth at any refresh rate.</h2>

<p align="center">Icons grow under your pointer with time-based motion: just as quick at 60, 144 or 240 Hz, only smoother on faster screens, with no overshoot.<br/>Pick glass (Windows 11 acrylic, light or dark), the taskbar's own look, or solid.</p>

<p align="center"><img src="docs/presentation/clip-magnify.webp" width="900" alt="The pointer moves along the Booki dock and the icons grow and settle under it" /></p>

<h2 align="center">Widgets that open with one click.</h2>

<p align="center">Clock, calendar, weather, system, battery, devices, AI usage, media, volume, notes, clipboard, focus, Collector, updates and lighting.<br/>One click opens a widget's details; right-click or its gear opens its settings.</p>

<p align="center"><img src="docs/presentation/clip-widgets.webp" width="900" alt="Clicking the Devices widget opens a panel with the battery of a mouse, a keyboard and headphones" /></p>

<p align="center"><img src="docs/presentation/widgets-en.jpg" width="1000" alt="Booki live widget panel and Collector session queue" /></p>

<h2 align="center">A gallery to make them yours.</h2>

<p align="center">The widgets on your dock sit at the top. Below, explore by category and add one in a click.<br/>Its settings open beside the gallery with a live preview: content, look and colour.</p>

<p align="center"><img src="docs/presentation/clip-gallery.webp" width="900" alt="In Booki's Widgets settings, Weather is added from the gallery and its colour is changed in the side sheet" /></p>

<p align="center"><img src="docs/presentation/settings-en.jpg" width="1000" alt="Current Booki Settings home with example dock" /></p>

<h2 align="center">The notch that tells you things.</h2>

<p align="center">A quiet capsule at the top of your screen for your focus timer, the song that's playing, a low battery,<br/>or your AI coding agents: working, waiting for you, done.</p>

<p align="center"><img src="docs/presentation/clip-notch.webp" width="760" alt="The Booki notch shows Claude working, then waiting, then Codex working, then Claude done" /></p>

<p align="center"><img src="docs/presentation/island-en.jpg" width="1000" alt="Claude Code, Cursor and Codex with working, waiting and finished states in the compact Booki notch" /></p>

<h2 align="center">Groups that look like yours.</h2>

<p align="center">Pin apps, folders, files and websites, then gather them into groups with a colour and an icon.<br/>Search inside a group and switch between list and icon sizes with Ctrl + wheel.</p>

<p align="center"><img src="docs/presentation/groups-en.jpg" width="1000" alt="Booki group flyout with search, selectable density and example app icons" /></p>

<h2 align="center">At home in the dark.</h2>

<p align="center">Follows your Windows theme and accent. When a game or video goes fullscreen, Booki steps aside.</p>

<p align="center"><img src="docs/presentation/dark-en.jpg" width="1000" alt="Current Booki Dock settings in dark mode" /></p>

---

<h2 align="center">Private by design.</h2>

<p align="center">No accounts. No telemetry. No cloud sync. Your tasks, notes and usage stay on your PC.<br/>Weather asks only for the city you choose — never your location.</p>

<p align="center"><img src="docs/presentation/diagram-ai-privacy.svg" width="960" alt="AI usage stays on your PC: Booki reads only local session logs and, if you opt in, Claude Code's status line and agent hook events; never sign-ins, tokens, credential files or the network" /></p>

<!-- booki:media:start -->
<p align="center"><sub>Source frontend captures for v0.98.0, with example data. Native Windows blur requires an in-app check.</sub></p>
<!-- booki:media:end -->

<!-- booki:news:start -->
## What's new in 0.98.0

Clearer Settings, like Windows 11: each widget and dock item gets its own page, colours use Booki's palette, and the dock no longer blocks clicks on half the screen.

- Choosing a widget or a dock item opens its own page (Widgets › AI usage), with no narrow columns at any window size.
- Apps & folders: a command bar (New, Add apps), details as cards and a dialog for adding apps, folders and sites.
- Background and accent colours as in Windows: a preview, the source in a drop-down and Booki's palette for the background (no free colour or accent fill).
- After it was shown again, the dock's whole transparent window kept capturing clicks, so programs on the lower half of the screen could not be moved or used until the pointer crossed the bar.
- Under Real Claude plan usage, Booki says whether Claude Code calls it and sends your plan usage, so you can tell why it does not show.

[Full release notes](docs/releases/v0.98.0.md)
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
| [0.97.0](docs/releases/v0.97.0.md) | Booki now understands your AI agents better: Claude's real plan usage and exact states for Claude Code, Codex, Gemini CLI and Cursor, plus flicker-free glass and Windows 11 controls. |
| [0.96.0](docs/releases/v0.96.0.md) | Windows 11 acrylic glass for each theme, a new widget gallery, smooth motion at any refresh rate and plugin updates. |
| [0.95.1](docs/releases/v0.95.1.md) | Clearer settings, consistent click activation and fixes for saving, captures and notices. |

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
| Click a widget | Open its details or controls |
| Right-click a widget, or its gear | Open the settings of that copy |
| Right-click a group → Customize | Edit name, icon and color; expand a picker only when needed, then Apply or Cancel |
| `Ctrl` + wheel inside a group | Switch between list and icon sizes |
| Drag from a group | See the shortcut and destination; `Escape` cancels |
| `Alt` + `1…9` | Launch the corresponding pin; the modifier is configurable |
| Push the cursor to the edge | Reveal a hidden dock when edge/hover behavior is enabled |
| Wheel over Media, if enabled | Change system volume |
| Hover a widget | Its hint lists the details (every device's battery, every AI usage window and when it resets) |

Collector supports video, audio, files and galleries: paste one link per line to queue several. Its gear opens folder, format and quality preferences, also available in Widgets and Plugins. The queue and results last until Booki closes.

## Privacy and your data

- No telemetry, accounts or cloud synchronization. Configuration lives at `%APPDATA%\Booki\config.json`, with a safety backup.
- Network requests are limited to update checks/downloads and website favicons, plus features you explicitly enable: Open-Meteo weather after choosing a city (never your device location), plugin downloads from their official release pages (each checked against a SHA-256 checksum pinned in Booki's source). The AI usage widget makes no network requests.
- The AI usage widget only reads, read-only, the local session logs of Claude Code (`~/.claude/projects`) and Codex (`~/.codex/sessions` and `archived_sessions`, or `CODEX_HOME`). For Cursor and OpenCode it only checks that their folders exist. Booki never reads, uses, stores or sends sign-ins, tokens or credential files, keeps no message content and makes no network request for it. Claude's logs hold no plan limits, so the widget shows tokens used; Codex's logs include its plan percentages; a missing allowance is shown as unknown, never estimated.
- Optional, off by default: **Real Claude plan usage** lets Claude Code pass its 5-hour and 7-day percentages to Booki through its status line (your own status line keeps running), and **Exact agent states** adds a Booki hook to Claude Code, Codex, Gemini CLI or Cursor so the notch knows when an agent is working, waiting for permission or done. Booki only writes those percentages and event kinds to `%LOCALAPPDATA%\Booki\agents`, backs up each agent's config once and removes only its own entries when you turn it off. No credentials, no network.
- Device batteries come from Windows itself, from Logitech receivers over USB, and, if you installed it, from HeadsetControl running on your PC. Nothing leaves your computer.
- Plugins live in `%LOCALAPPDATA%\Booki\plugins`; removing one in Settings deletes its folder. Booki tells you when a newer pinned version is available, and updating keeps your widgets as they are. They are independent third-party tools under their own licenses, installed only when you choose to; you are responsible for using them lawfully. See the [terms of use](TERMS.md).
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

README images and clips are recorded from the real frontend with sample data by [tools/presentation](tools/presentation/README.md) (`stills.mjs`, `clips.mjs`); finished media live in `docs/presentation/`.

To audit the current public release without running its installers:

```bash
node scripts/audit-release.mjs /absolute/path/to/release-audit
```

This downloads the public assets, checks GitHub hashes, verifies updater signatures using Booki's configured public key, and validates the manifest and installer containers. It does not verify Windows runtime behavior or Authenticode.

Releases are built from version tags through [release.yml](.github/workflows/release.yml). Publishing requires the complete signed updater asset set and matching versions. The workflow uploads and re-downloads the draft assets for integrity checks before publication, preserving older releases for rollback.

## License and credits

[MIT](LICENSE) · [Terms of use and plugin notice](TERMS.md). Booki by [Punkable](https://github.com/punkable) · [@0xPunki](https://x.com/0xPunki).

Emoji artwork: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) © Microsoft, MIT. AI provider logos: [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT); the marks belong to their owners. Device glyphs: [Lucide](https://lucide.dev/) (ISC). Optional city weather: [Open-Meteo](https://open-meteo.com/). The presentation uses the official Booki logo, [Inter](tools/presentation/fonts/OFL.txt) under the SIL Open Font License, and no third-party music. See the [visual identity guidelines](docs/brand/README.md).
