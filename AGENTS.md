# Booki: guide for agents

Booki is a free, MIT, privacy-first dock for Windows 10/11 by Punkable (GitHub `punkable`). Pinned apps, folders, files and websites in colour groups, live widgets, a notch that stands in for the dock while it is hidden, and a five-page Settings app. Current release: see `version` in `package.json`.

Read these before changing anything:

- [`docs/HANDOFF.md`](docs/HANDOFF.md): where the project stands, what is in progress, what is pending and how the owner likes to work.
- [`docs/brand/README.md`](docs/brand/README.md): the visual identity and design system. The graphic line is settled; extend it, do not redesign it.

## Stack and layout

| Path | What lives there |
|---|---|
| `src-tauri/src/` | Tauri 2 + Rust native core. `lib.rs` wires commands and windows; `config*.rs` the config model and migrations (`SETTINGS_REV`); `dock_window.rs`, `notch_window.rs` window placement; `apps.rs`, `app_catalog.rs` app discovery; `media.rs`, `metrics.rs`, `weather.rs`, `clipboard*.rs`, `notifications.rs` widget backends; `profiles.rs`, `profile_store.rs` profiles |
| `src-tauri/src/win/` | Win32 code: `windows_impl.rs` (shell, windows, icons), `material.rs` (native blur), `system_events.rs`, `shell_notify.rs`. `stub.rs` is the non-Windows build |
| `src/dock.js` + `src/dock/` | The dock, vanilla JS. Shared state object `S` in `dock/state.js`; one module per concern (render, magnify, autohide, menus, group-ops, keyboard-nav, live-widgets, launcher…) |
| `src/notch.js`, `src/notch-mode.js` | The notch window: shapes, live activities, hit-testing |
| `src/settings.jsx` + `src/settings/` | React 19 Settings. Pages in `settings/pages/` (home, dock, widgets, apps, system) |
| `src/styles/tokens.css` | Shared design tokens (colour, type, radius, motion) |
| `src/styles.css`, `src/styles/*.css` | Dock and notch styles; `settings.css`, `widgets.css`, `menus.css` |
| `src/look-model.js`, `src/system-look.js` | Where colours come from (`colorSource`); `paintedLook(cfg)` is what every window paints |
| `src/surface.js`, `src/material.js`, `src/theme.js` | Finishes (Glass/Mica/Solid), native blur reports, theme and accent |
| `src/palette.js`, `src/group-style.js` | Accent palette and group colours |
| `src/i18n.js`, `src/strings.js`, `src/i18n-extra.js` | Strings in en, es, pt, fr, de |
| `src/api.js` | Tauri bridge, with an in-browser demo store so the UI runs without Windows |
| `tests/` | Node test runner + Playwright against the built frontend (`tests/harness.mjs`) |
| `scripts/` | Repository checks, release helpers, winget manifests, Windows measurement script |
| `docs/` | Brand, releases (`docs/releases/vX.Y.Z.md`), quality audits, distribution, presentation media |
| `tools/presentation/` | Reproducible README stills and film from the real frontend |

## Commands

```bash
npm ci
npm run dev          # browser preview at http://localhost:1420 with sample data
npm run check:all    # node/version checks, lint, typecheck, text/icons/i18n, build, tests
npm run tauri:dev    # native app (Windows + Rust)
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Node is pinned to `>=24.18 <25`, npm 11. Tests need Chromium for Playwright. The Linux Rust build needs the GTK/WebKit packages listed in `.github/workflows/checks.yml`.

CI (`.github/workflows/`): `checks.yml` runs `check:all` and Rust fmt/clippy/test; `build-windows.yml` packages x64 and arm64; `release.yml` is a manual dispatch from `main` with a `vX.Y.Z` tag input that builds, signs the updater assets and publishes.

## Working rules

- Work on a branch and open a PR. Keep CI green before merging. Squash-merge with a descriptive title.
- **Do not publish a release unless the owner asks for one.** Merging is fine; releases are batched.
- A release bumps the version in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `Cargo.lock` (`npm run check:versions` enforces it), adds `docs/releases/vX.Y.Z.md`, updates `src/release-notes.js` and its `release<NN>.*` strings in all five languages, and the "New in" section of both READMEs.
- Every user-facing string goes through `t()` and exists in all five languages (`npm run check:i18n`).
- Config changes need a serde default in `config.rs`, a migration if a field changes meaning, and the JS side reading it with a fallback.
- Browser tests do not prove Windows behaviour. Say what was and was not verified; never claim a Windows test that did not happen.
- READMEs: `README.md` (English, primary) and `README.es.md` (Spanish). Audits and handoff notes are in Spanish; code, comments, commits and PRs in English.
- The owner writes in Spanish. Answer in Spanish.

## Design rules (short version)

The full guide is `docs/brand/README.md`.

- Calm, native, warm. Segoe UI Variable, Windows materials, Booki tan `#dfaa75` as the default accent.
- New colours come from tokens or the palettes; new surfaces reuse `--surf-*` and `--panel-*`.
- Every surface follows the same resolved theme. Check light, dark and system; Glass, Mica and Solid; all four edges.
- The notch and the dock are one object: transitions between them morph one shape into the other.
- Edit in place. Groups and profiles open where they are; avoid panels that unfold downward.
- Respect reduced motion, reduced transparency and high contrast.

## Windows gotchas

- Tauri's file-drop handler swallows HTML5 drag and drop on Windows. Any window that needs HTML5 DnD must call `.disable_drag_drop_handler()` (Settings does). The dock uses pointer events instead.
- WebView2 cannot pass clicks through with CSS alone. The dock and notch report their painted rects to the backend, which toggles `ignore_cursor_events`.
- Win32 blur-behind ignores `SetWindowRgn`; blur windows are inset by `surface_geometry::blur_insets` so corners stay round.
- Long native work goes through `util::blocking`, off the UI thread.
- The installer is not Authenticode-signed yet; updates are verified with the Tauri updater key.

<!-- anti-slop-support:start -->
## Design support: Anti Slop

Anti Slop is available as supporting guidance for UI/UX, visual design, accessibility,
responsive layouts, interface copy and comment quality. Load only the relevant skills:

- Core: `.agents/skills/antislop/SKILL.md`
- UI and visual design: `.agents/skills/antislop-ui/SKILL.md`
- Accessibility, contrast, keyboard and states: `.agents/skills/antislop-human/SKILL.md`
- Responsive layouts: `.agents/skills/antislop-layoutmobile/SKILL.md`
- Copy and interface text: `.agents/skills/antislop-copywriting/SKILL.md`
- Code comments: `.agents/skills/antislop-code/SKILL.md`

For UI work, read the core together with UI, accessibility and responsive guidance.
Use this as a quality filter, alongside the project's current design/brand direction.
Explicit user instructions and established project identity take precedence over examples
or generic style preferences. Preserve purposeful glass, Mica, animation, type and icons.
Do not invent product claims, metrics or test evidence. Do not apply a redesign merely
because these skills were installed. Existing authorization to implement fixes remains valid;
these supporting skills do not create additional approval steps for authorized work.

The global default mode is `during` when no saved preference exists; explicit session mode
and any existing saved preference take precedence. Source: miqdadbadjuber/anti-slop,
version 3.2.20, commit 388cbe3b6c37d5175b9f460015bb092ef9e34894, MIT. Local provenance and hashes:
`.agents/skills/antislop-source.json`. Updates are explicit, never automatic.
<!-- anti-slop-support:end -->
