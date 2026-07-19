# AGENTS.md

Guidance for AI agents and contributors working on Booki.

Booki is a public open-source Windows dock. Treat everything committed here as
public documentation or source code. Do not add private local paths, user names,
clipboard contents, tokens, secrets, machine-specific logs, unpublished support
details, or screenshots from a private desktop.

## Project Snapshot

- Product: Booki Dock, a lightweight smart dock for Windows with apps, folders,
  widgets, clipboard history, smart hide, a floating notch, and capture controls.
- Stack: Tauri 2, Rust backend, React 19, Vite, Windows WebView2.
- Privacy posture: local-first, no accounts, no telemetry, no cloud sync.
  Clipboard memory must remain opt-in and clearly explained.
- Current public beta context at this writing: `0.58.0` — groups UX polish,
  unified dock/notch surfaces (mica/acrylic/tinted/solid), notch size control,
  and NSIS uninstall that **preserves** `%APPDATA%\Booki` unless the user checks
  Delete app data. Earlier waves covered Settings Appearance/Behavior split,
  smart-hide + notch reliability, clipboard opt-in memory, and text encoding checks.

## Important Files

- `src/dock.js`: dock runtime, widgets, hover behavior, update checks.
- `src/settings.jsx`: Settings UI, app/widget management, widget editor dialogs.
- `src/styles.css`: dock, settings, modal, widget, notch, and responsive styles.
- `src/i18n.js` and `src/i18n-extra.js`: visible copy in English/Spanish.
- `src/changelog-data.js`: in-app "What's new" content.
- `src/api.js`: frontend bridge to Tauri commands.
- `src-tauri/src/lib.rs`: Tauri commands and window coordination.
- `src-tauri/src/config.rs`: persisted app config defaults and migrations.
- `src-tauri/src/win/`: Windows-specific integration.
- `assets/screenshots/`: README visuals. Do not replace the gallery unless the
  task explicitly asks for screenshot updates.
- `docs/ARCHITECTURE.md`: deeper architecture notes.
- `.github/workflows/build-windows.yml`: CI build.
- `.github/workflows/release.yml`: tag-based Windows release and updater assets.

## Local Workflow

Use the package scripts already defined in `package.json`:

```powershell
npm ci
npm run dev
npm run check:text
npm run build
npm run tauri:build
```

Useful pages during Vite development:

- `src/index.html`: dock.
- `src/settings.html`: Settings.
- `src/notch.html`: floating notch.

Before committing meaningful UI or release changes, run:

```powershell
npm run check:text
npm run build
git diff --check
```

Run `npm run tauri:build` when Rust/Tauri is available locally. If it is not
available, make that limitation explicit and rely on the Windows GitHub Actions
build before considering a release complete.

## UX And Design Direction

- Booki should feel like a polished Windows utility, not a landing page or
  generated demo UI.
- Prefer calm, functional surfaces over decorative gradients, excessive glow,
  fake glass, oversized cards, or unexplained emoji.
- Use the existing icon system in `src/icons.js` and brand assets under
  `assets/brand/` instead of ad hoc inline artwork.
- Keep Settings organized by intent:
  - global behavior belongs in general/behavior sections;
  - widget-specific options belong inside that widget's editor;
  - do not mix one widget's controls below the whole pinned-app catalog.
- Dialogs and flyouts must stay inside the viewport, support narrow windows,
  scroll internally when needed, and avoid accidental closure during editing.
- Dock hitboxes should match the visible UI closely. Invisible margins should
  not block clicks outside the dock or trap context menus/flyouts.
- Horizontal and vertical dock layouts both matter. Widgets must not stretch the
  dock vertically or horizontally without bounds.
- Long widget text, especially clipboard text, needs width limits and stable
  marquee behavior. Avoid animation loops that accelerate with re-renders.
- Tinted glass should read as a real translucent surface. Avoid all-black
  screenshots, fake mockups, and UI captures that do not resemble the product.

## Clipboard Trust Rules

Clipboard features are sensitive. Keep the UX explicit and boringly trustworthy:

- Clipboard memory is opt-in.
- Retention and history limits should be configurable and easy to understand.
- Sensitive-content handling should be presented as local protection, not as
  hidden surveillance.
- Never log clipboard item contents to the console, release notes, tests, or CI.
- Do not add cloud sync, remote analytics, or background upload behavior.

## Screenshots And README

- The README's main dock image is `assets/screenshots/dock.png`.
- Existing GIFs and secondary screenshots should not be regenerated casually.
- If screenshots are updated, show the real dock/notch/settings on a pleasant
  wallpaper or product-like presentation. Avoid black backgrounds, cropped dock
  edges, crossed annotation lines, broken logos, or invented UI.
- Make sure screenshots do not expose private user data, local paths, account
  names, notifications, clipboard contents, or desktop files.

## Release Notes

- Releases are versioned across:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`
  - `src-tauri/tauri.conf.json`
- `release.yml` publishes from tags like `v0.49.11`.
- The release is intentionally marked as a normal GitHub release, even when the
  title/body say beta, so the updater endpoint
  `releases/latest/download/latest.json` resolves correctly.
- The workflow prunes older releases, keeping the latest beta downloadable.
- Do not push a version tag unless the app should actually ship.

## Security And Dependency Work

- Keep workflow permissions explicit. The build workflow should only need read
  access; release needs write access to publish assets.
- Do not silence Dependabot or CodeQL findings without a clear explanation.
- For Rust advisories, verify the dependency path and compatibility before
  changing core Tauri/plugin versions.
- Never commit `.env`, signing keys, generated secrets, local logs, `dist/`,
  `node_modules/`, or `src-tauri/target/`.

## Text Encoding

The project has had visible mojibake in release/changelog text before. Keep
visible copy UTF-8 clean and run:

```powershell
npm run check:text
```

Prefer plain ASCII in code comments unless the surrounding file already uses
localized UI text or there is a clear product reason for non-ASCII.

## Review Checklist

For UI changes:

- Check desktop and narrow/mobile-sized windows.
- Check Settings, dock, notch, widget flyouts, and relevant modals.
- Confirm there is no horizontal overflow.
- Confirm visible text does not overlap or get cut off.
- Confirm console output has no fresh runtime errors.

For dock behavior:

- Test horizontal and vertical dock positions.
- Test expanded/collapsed states.
- Test clicking just outside the dock.
- Test widget text overflow and marquee behavior.
- Test context menus/flyouts are not clipped by parent containers.

For release changes:

- Run local checks where possible.
- Push `main`, tag the version, then verify GitHub Actions.
- Confirm the release contains the installer, `.sig`, and `latest.json`.
- Confirm `latest.json` points to the new version.
