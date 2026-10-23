# Widget content and settings workspaces

Development after 0.95.1. These changes are grouped on one branch for local Dev testing; this document does not announce a public release.

## Interaction contract

- Clicking a widget uses it: its content or controls open beside the dock. Media's explicit playback buttons and Volume's wheel remain quick actions.
- The same route serves all 15 widgets on the dock, in groups and in the widget hub. Opening a grouped widget replaces the group flyout and anchors to its surviving dock tile.
- A widget double-click never opens Settings. The empty dock's double-click shortcut remains available.
- Context menu Settings and panel gear target the exact widget instance. Duplicate copies have an explicit instance selector, including their group.
- The inspector starts with Content. Appearance is a separate step; Connections appears only for widgets with optional providers. Tabs support arrow keys/Home/End, and Previous/Next preserve the draft and current selections.

## Functional settings

| Widget | Content / functional preferences |
| --- | --- |
| Clock | Locale-default/12/24-hour time, seconds, date visibility, calendar week start; the expanded panel includes its current time and calendar |
| Calendar | Regional/Monday/Sunday week start, Windows date/time settings |
| Weather | Explicit city search and selection, clear location, Celsius/Fahrenheit; configured widget opens its forecast with location editing folded |
| System | CPU/RAM/disk/network selection; expanded readings reflect those metrics and refresh while open |
| Battery | Hide when unavailable, Windows power settings; expanded readings refresh while open |
| Devices | Specific device or all devices, rotation, hide when unavailable, measurement freshness explanation |
| AI | Specific provider or detected providers, rotation, hide when unavailable; shared notch/usage notice setting clearly labeled; no fabricated subscription limits |
| Media | Wheel volume and hide when unavailable; actual transport controls on click |
| Volume | Configurable wheel increment, Windows audio settings; actual master/per-app mixer on click |
| Notes | Multiline text with the existing 20,000-character limit; dock click opens its durable editor |
| Clipboard | Clearly labeled shared persistence, sensitive pattern guard, compact view, retention, limit and clearing |
| Focus | Block duration, optional Do not disturb and tucking; running deadline is preserved when changing the next duration |
| Collector | Clearly labeled shared folder, default format and quality; dock click opens the session queue |
| Updates | Restore skipped application updates and show their count; missing winget offers App Installer |
| Lighting | OpenRGB profile management and provider connection; dock click opens actual available profiles |

## Plugin associations

Explicit capability mapping: HeadsetControl → Devices, LibreHardwareMonitor → System, yt-dlp/FFmpeg/gallery-dl → Collector, OpenRGB → Lighting, winget → Updates. Existing widgets anywhere in the pinned tree get Configure, not another Add button. Adding a widget names the actual widget; unrelated plugins never say Add Collector. Installation from Settings waits for the terms acceptance write to finish successfully.

## Dev delivery and verification limits

The existing Windows build workflow accepts `edition=dev` on manual dispatch. It runs the same checks and uses `tauri.dev.conf.json`, the Dev identifier/icons/hooks and disabled updater artifact creation. Dev artifacts are separately named and validated; the production release workflow is not invoked. Installers must be run on the user's Windows PC to update that local Dev installation; this Linux workspace cannot install software on that PC.

Browser tests use native-bridge fixtures, not the user's data or real plugin downloads. Real Windows hardware, compositor behavior and installed upgrades still require a Windows check. The public 0.95.1 release remains the stable baseline until a new release is explicitly requested.
