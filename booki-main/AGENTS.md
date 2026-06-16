# Booki — Chrome Extension

Privacy-focused, open-source bookmark manager with cross-device sync, auto-tagging, health scoring, dead link checker, read-later, and DnD reorder.

## Quick Start

```bash
# Load in Chrome/Brave
1. Go to chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this folder
```

## Architecture

```
├── manifest.json          # MV3 — permissions, omnibox, commands
├── options.html + .js     # Settings page (6 tabs, swatches, sync, folder colors)
├── popup.html + .js       # Toolbar popup (400×600px) — quick save, search, star
├── sidepanel.html + .js   # Main manager — Library, Folders, Organize, Tools
└── src/
    ├── styles.css          # All CSS — glass aesthetic, responsive, dark mode
    ├── icons.js            # 36 SVG icon functions (Lucide-style, 24×24, 1.5px stroke)
    ├── i18n.js             # en/es translations (~120 keys), browser-detect, dynamic switch
    ├── shared.js           # Settings, meta, bookmark CRUD, TF-IDF tagging, health, injectIcons
    └── background.js       # Service worker — omnibox, alarms, dead links, sync, content capture
```

## Key Conventions

- **No bundler/framework** — vanilla ES modules (type="module" in scripts)
- **SVG icons via `data-icon`** — `<span class="svg-icon" data-icon="bookmark"></span>`, injected by `injectIcons()`
- **i18n via `data-i18n`** — `<span data-i18n="nav.library">Library</span>`, rendered by `applyI18n()`
- **Settings live in `chrome.storage.local`**, meta (tags, stars) also local. Sync via `chrome.storage.sync`
- **All async** — `getSettings()`, `getMeta()`, `saveSettings()`, `saveMeta()` are async
- **No jQuery** — `$(id)` = `document.querySelector(id)`, `$$(sel)` = `document.querySelectorAll(sel)`

## Settings System

DEFAULT_SETTINGS in `src/shared.js:1`:
```js
{ openInNewTab: true, openInTab: false, focusSearch: true, language: "",
  defaultView: "library", autoTagOnSave: true, confirmDelete: true,
  accentColor: "auto", compactView: false, showHealthBadges: true,
  rememberView: true, searchScope: "all", deadLinkBadge: true }
```

Settings propagate via messaging: Options → `saveSettings()` broadcasts → background relays → sidepanel re-applies. Listen for `"settings-changed"` in `onBackgroundMessage()`.

## i18n System

- `LOCALES.en` and `LOCALES.es` objects in `src/i18n.js`
- Keys use dot notation (e.g. `"nav.library"`, `"settings.compactView"`)
- `t(key, fallback)` — returns translation or fallback or key itself
- `detectBrowserLanguage()` — reads `navigator.language`, checks supported
- `setLanguage(lang)` — sets current language, stored in settings + localStorage
- Adding new keys: add to both `en` and `es` objects

## Bookmark Meta

Stored separately from Chrome bookmarks (which don't support custom fields):
```js
{ tagsByBookmarkId: { "123": ["design", "dev"] },
  starredIds: ["123", "456"],
  folderColorsById: { "folderId": "mint" },
  categoriesByBookmarkId: { "123": "tech" },
  deadLinks: { "123": { ok: false, status: 0, checked: 1700000000000 } },  // result + timestamp of last dead check
  pageContent: { "123": "stripped text content…" },
  healthScores: { "123": 85 } }
```

## DnD Implementation

`src/sidepanel.js` — drag-and-drop reorder via native HTML5 Drag API:
- `handleBookmarkDragStart()` — stores dragged bookmark id
- `handleDragOver()` — shows `drag-indicator` line (3px colored bar) between items
- `handleDrop()` — calculates target index from mouse Y relative to item center, calls `chrome.bookmarks.move()`
- Folder view: `stopPropagation()` on folder bookmark drag to prevent double-handling

## Health Scoring

`computeHealth()` in `shared.js`:
- Base: 50, Starred: +15, Tagged: +10, Categorized: +10, Fresh (<7d): +10, Aged (>365d): -10, Dead link: -20
- Thresholds: great ≥80, ok ≥50, poor <50

## Auto-Tagging

`buildTermIndex()`/`suggestTags()` TF-IDF on titles/URLs/domains with stop word filter in `shared.js`.

## Dead Link Checker

Daily via `chrome.alarms.create("check-dead-links")` in background. HEAD fetch with 8s timeout, `no-cors` mode, batch of 50/day. Results in `meta.deadLinks`.

## Sync

Three mechanisms:
1. **Push/Pull snapshots** via `chrome.storage.sync` (cross-device, same Google account)
2. **Sync code** — generates short code, chunks payload across multiple sync keys (6KB per chunk)
3. **Export/Import** — JSON file with full bookmark data + meta

## Per-Section Accents

View tabs set `--section-accent` via `style.setProperty()`:
- Library → blaze-orange `#fb5607`
- Folders → blue-violet `#8338ec`
- Organize → azure-blue `#3a86ff`
- Tools → neon-pink `#ff006e`

## Color Palette

Accent: amber-gold `#ffbe0b`, blaze-orange `#fb5607`, neon-pink `#ff006e`, blue-violet `#8338ec`, azure-blue `#3a86ff`
Neutral: ghost-white `#fafaff`, platinum `#eef0f2`, soft-linen `#ecebe4`, alabaster-grey `#daddd8`, carbon-black `#1c1c1c`

## Common Patterns

```js
// Getting elements
const el = { search: $("#searchInput"), list: $("#bookmarkList") };

// Rendering HTML safely
function esc(v) { return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

// Toast notifications
toast("Saved!");       // success (green)
toast("Error!", "error"); // error (red)

// Icon injection (call after rendering HTML with data-icon attributes)
injectIcons();

// i18n after language change
applyI18n();

// Getting bookmark data with meta enrichment
const data = await getBookmarkTreeData();
// => { folders: [...], bookmarks: [...], meta: {...}, deadLinks: {...} }
// Each bookmark has: .tags, .category, .starred, .dead, .health
```

## Permission Notes

- `bookmarks` — read/write Chrome bookmarks
- `storage` — chrome.storage.local (settings, meta) + chrome.storage.sync (cross-device sync)
- `sidePanel` — open sidepanel via `chrome.sidePanel.open()`
- `favicon` — access `chrome://favicon/` for bookmark icons
- `tabs` — get current tab, create tabs
- `contextMenus` — right-click "Save to Booki"
- `alarms` — daily dead link checker
- `scripting` — content capture
- `host_permissions` — fetch for dead link HEAD requests & content capture
- `omnibox` keyword: `booki`

## Adding Features

1. Add setting key to `DEFAULT_SETTINGS` in `shared.js`
2. Add UI control in `options.html` + bind in `options.js`
3. Apply setting in `sidepanel.js:applySettings()`
4. Use setting via `state.settings.yourKey`
5. Add i18n keys in both `en` and `es` objects
