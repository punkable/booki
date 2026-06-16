# Booki

A cheerful, privacy-focused bookmark manager for Chrome, Brave, and other Chromium browsers.

## Features

- **Smart library** — View, search, star, filter (All / Starred / Recent), and manage bookmarks
- **Folder management** — Color-coded folders, expand inline, drag bookmarks between folders
- **Auto-organize** — Categorize bookmarks by content with one click
- **Auto-tagging** — TF-IDF suggests tags from titles, URLs, and domains
- **Health scoring** — Scores bookmarks (0–100) based on freshness, tags, stars, dead links
- **Dead link checker** — Daily background check, badges on broken bookmarks
- **Read-later** — Captures page content for offline reading in an inline reader panel
- **Preview panel** — Large favicon, domain, health score, editable tags, actions
- **Drag & drop** — Reorder bookmarks with a visual indicator line
- **Sync** — Cross-device via `chrome.storage.sync` (same Google account) or sync codes
- **Import/Export** — JSON (with metadata) or standard HTML bookmark files
- **Omnibox** — Type `booki` + Tab to search bookmarks from the address bar
- **i18n** — English / Español, auto-detects browser language
- **Custom accent** — 5 vibrant colors (amber, orange, pink, violet, blue) per-section or global

## Quick start

```bash
# Load the extension
1. Go to chrome://extensions or brave://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this folder
```

Toolbar button opens the popup (quick save, search, star). `Alt+B` opens the full side panel manager. Right-click any link → "Save to Booki".

## Architecture

Plain MV3 HTML, CSS, and JavaScript — no bundler, no framework. Easy to inspect, modify, and load unpacked.

```
├── manifest.json
├── options.html + .js     # Settings (6 tabs: Appearance, Behavior, Search, Folders, Sync, Language)
├── popup.html + .js       # Toolbar popup — quick save, search, star toggle
├── sidepanel.html + .js   # Full manager — Library, Folders, Organize, Tools
└── src/
    ├── styles.css          # All CSS
    ├── icons.js            # 38 SVG icon functions (Lucide-style)
    ├── i18n.js             # en/es translations (~150 keys)
    ├── shared.js           # Settings, meta, bookmark CRUD, TF-IDF, health, injectIcons
    └── background.js       # Service worker — omnibox, alarms, dead links, sync, content capture
```

## Privacy

- **No data leaves your browser** except through `chrome.storage.sync` (your Google account)
- **No analytics, no tracking, no external servers**
- **All data is stored locally** — bookmark content stays in Chrome's native bookmark system
- **Open source** — inspect every line of code

## License

MIT
