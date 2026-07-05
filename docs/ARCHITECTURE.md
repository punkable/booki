# Booki Dock — Architecture & developer guide

A modern, lightweight **dock for Windows** (macOS-dock-style launcher), inspired by
[Docky](https://github.com/josejuanqm/docky) but rebuilt from scratch for Windows.
Booki Dock keeps the original Booki **brand** (capybara logo, tan accent) — it is **not**
the old bookmark extension (that lives in this repo's git history on `main`).

## Stack

- **Shell:** Tauri 2 (system WebView2 — no bundled Chromium → tiny, low-RAM).
- **Backend:** Rust + the official `windows` crate (Win32) for native dock behavior.
- **Frontend:** vanilla HTML/CSS/JS, bundled with Vite. No framework.

## Layout

```
src/                    # Frontend (WebView2)
  index.html  dock.js   # the dock surface + logic (tiles, magnify, drag, launch)
  settings.html .js     # settings window
  api.js                # Tauri bridge wrapper, with browser fallbacks (demo data)
  styles.css            # brand tokens + dock + settings styling
  icons.js  theme.js
src-tauri/              # Rust backend
  src/lib.rs            # Tauri builder, tray, #[tauri::command]s, window positioning
  src/config.rs         # JSON config (serde) at %APPDATA%\Booki\config.json
  src/apps.rs           # launching apps (std::process)
  src/win/              # Win32: windows_impl.rs (cfg windows) + stub.rs (others)
  capabilities/         # Tauri v2 permissions
  icons/                # app icons generated from assets/brand/png/isotype.png
assets/brand/           # Booki brand kit (svg + png) — DO NOT delete
```

## Key conventions

- **`$(id)`** in settings = `document.getElementById`. No jQuery.
- **Frontend ↔ backend** only through commands defined in `src-tauri/src/lib.rs` and
  wrapped in `src/api.js`. When you add a command, register it in `generate_handler!`
  **and** add a wrapper in `api.js` (with a browser fallback in `mockInvoke`).
- **`api.js` must keep working in a plain browser** — `window.__TAURI__` is absent during
  `npm run dev`, so every call falls back to demo data. Preserve that for UI iteration.
- **Native code is Windows-only.** Real impl in `src/win/windows_impl.rs` behind
  `#[cfg(windows)]`; `src/win/stub.rs` provides no-op fallbacks for other targets so the
  crate still `cargo check`s on Linux/macOS.
- **Brand:** capybara logo + tan. Tokens in `styles.css` `:root`: `--booki-tan #dfaa75`,
  `--booki-tan-deep #b9875f`, `--booki-ink #302f35`. Accent defaults to `--booki-tan`.

## Config shape (`config.rs` ↔ `Config` ↔ JS)

```jsonc
{
  "pinned": [{ "id": "x", "name": "Edge", "path": "C:/.../msedge.exe", "args": [] }],
  "edge": "bottom",          // bottom | top | left | right
  "accent": "#dfaa75",
  "theme": "system",         // system | light | dark
  "iconSize": 48,
  "magnification": true,
  "autoHide": false,
  "alwaysOnTop": true
}
```
Rust uses `#[serde(rename_all = "camelCase")]`, so JSON keys are camelCase.

## Commands (lib.rs)

`get_config`, `save_config`, `launch_app`, `app_icon` (native PNG data-URI, None off-Windows),
`list_windows`, `focus_window`, `reposition_dock`, `set_always_on_top`, `open_settings`, `quit`.

## Build & verify

```bash
npm install
npm run dev          # browser UI preview (mock data) — fastest brand/UX loop
npm run tauri:dev    # real app (Windows only)
npm run tauri:build  # installers (.exe/.msi) — Windows only
```

- **On Linux**, validate native Rust without a Windows host:
  `rustup target add x86_64-pc-windows-msvc && cargo check --target x86_64-pc-windows-msvc`
  (run in `src-tauri/`; needs a `dist/` — run `npm run build` first so `generate_context!` finds assets).
- **CI** (`.github/workflows/build-windows.yml`) builds installers on `windows-latest`
  for every push; artifacts under the run's **Artifacts**.
