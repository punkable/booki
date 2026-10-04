# Premium workspace implementation and verification

## Baseline and continuity

This work starts from `d2f1c849`, the 0.70 overhaul merged through PR #78. It preserves the issue #64 shortcut fixes, explicit copy/move behavior, Win+D recovery, pagination, translations, config write coordination, the repaired widget previews and the eight-scene 40-second Remotion presentation.

The latest public release verified during this work is **v0.69.0**. A package version of 0.70.0 and a merged PR do not establish that a signed 0.70 release has shipped.

## Delivered changes

1. **Discovery and recommendations:** native packaged-app discovery, launch identities for shortcuts, shared matching/sections, Windows/local recency (including packaged-app UserAssist records), explicit partial-source errors, recommendations/privacy controls and bulk selection that survives searches.
2. **Design and navigation:** neutral white/dark Settings surfaces, coordinated material presets, responsive app cards, interactive Home preview and search that scrolls to and focuses the requested setting.
3. **Productivity:** one-click timer restart, serialized task writes, task editing, previous/next/current calendar month and Celsius/Fahrenheit choice.
4. **Performance and structure:** one bounded icon cache shared across consumers with four concurrent extractions; native extraction/scanning off the async command thread; app-candidate, profile and update modules separated from the large entrypoints. Observers are disconnected on panel disposal. Update lifecycle contracts join the existing TypeScript-checked JavaScript modules.
5. **Installation and updates:** signed background download, explicit restart/apply, retained progress across tab changes, quiet NSIS update of the existing per-user installation, a process-wide update lock and three retained config/profile backups. NSIS updates are pinned to the current executable directory, including custom install paths. Quiet updates require the registered per-user NSIS installation; MSI/portable copies are directed to the same installer type instead of silently creating a second installation. Settings stays alive when closed during an update. Failed saves/backups block installation. Uninstall keeps user data by default; explicit deletion remains available and is disabled for `/UPDATE`.
6. **Presentation and repository:** English is the primary GitHub/product presentation. Existing translated material and useful older screenshots are retained. No Booki Pro or WinUI3 implementation remnants were found in tracked source during this audit. Product media uses real frontend captures and the existing Booki identity.

## Browser/bridge measurements

Five Chromium runs at 1280×960 with 300 fixture apps. Compare the initial workspace with this implementation. Run `node scripts/benchmark-ui.mjs result.json` after `npm run build`.

| Median | Before | After |
|---|---:|---:|
| First contentful paint | 152 ms | 124 ms |
| Open app library | 98 ms | 102 ms |
| Search for app 299 | 19 ms | 22 ms |
| Native icon requests after leaving and revisiting library | 21 | 11 |

Timings include Playwright interaction overhead and vary with machine load. This small sample does **not** establish a general speed improvement. The icon-request reduction is the clear measured result. Cache tests also verify coalescing, eviction, retry and concurrency. Native Windows CPU, memory, compositor latency and actual installer runtime have not been measured on this Linux host.

## Verification boundaries

- Frontend checks cover lint, strict contracts for extracted logic, encoding, versions, icons, five-language coverage, release-manifest validation, production build and functional browser tests.
- The complete Windows integration module, including new discovery, shortcut identities and packaged-app icons, was type-checked against `windows` 0.58.0 for the Windows MSVC target.
- Settings snapshots and usage parsing/ranking are tested separately without the Tauri host.
- The frontend suite contains 115 functional/model tests, including the update UI flows and filtering removed packaged apps from recommendations. The initial PR CI passed full native Linux checks, native Windows x64 tests and x64/ARM64 installer packaging.
- The local full native Linux build needs GTK/WebKit development packages absent on this host. Windows packaging and full native checks run in the PR's existing CI, for x64 and ARM64. Packaging success is not interactive Windows runtime verification.

The new separated download/apply flow requires this client version. An older installed updater retains its prior UI for the first upgrade.

Before publishing: verify a real signed upgrade from 0.69, configured apps/profiles retained, restart behavior, uninstall/reinstall without data deletion, app discovery with real shortcuts/MSIX apps, DPI/multiple monitors, native glass, keyboard navigation and idle CPU/RSS. Publish one complete release with matching versions and signed assets after those checks; do not tell an issue reporter a pending update is already available.

## Windows performance capture

On the same Windows machine, compare the previous release and the candidate with the same pins, theme, DPI and monitor. Warm up for 30 seconds, then capture idle-visible, idle-hidden, widget activity and Settings app-search workloads separately:

```powershell
./scripts/measure-windows.ps1 -Seconds 60 -OutputPath before-idle.json
./scripts/measure-windows.ps1 -Seconds 60 -OutputPath after-idle.json
```

The script reads Booki and its descendant WebView2 process counters; it does not read user configuration, app titles or clipboard data. It reports machine-normalized CPU, aggregate working sets, private committed bytes and handles. Aggregate working sets can double-count shared pages. Sampling has overhead and is not a compositor/frame-latency measurement. This Windows-only script is provided for real-device verification; it has not been executed on the Linux authoring host.
