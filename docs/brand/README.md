# Booki visual identity and design system

This is the reference for how Booki looks, moves and speaks, as shipped in **0.84**. The graphic line is settled: new work extends it, it does not redesign it. When this page and the code disagree, the code in `src/styles/` wins and this page should be corrected.

## 1. Character

Booki is a calm, warm Windows dock. It should feel like part of Windows 11, with one personality detail: the capybara and its tan.

- **Calm.** Quiet surfaces, one accent, few borders, no decoration that does not help.
- **Native.** Segoe UI Variable, Windows materials (Glass, Mica, Solid), Windows accent and taskbar colours when the user asks for them.
- **Warm.** Tan accent, warm neutrals in Settings, rounded shapes, a capybara mascot.
- **One object.** The dock, the notch and their flyouts share one material and one motion language. They read as the same thing in different shapes.

## 2. Logo and mascot

| File | Use |
|---|---|
| `assets/brand/svg/logo.svg` | Wordmark with capybara, on light backgrounds |
| `assets/brand/svg/logowhite.svg` | Same, on dark backgrounds |
| `assets/brand/svg/isotype.svg` / `isotypewhite.svg` | Capybara alone: app icon, README header, small spaces |
| `assets/brand/svg/logoonlytextblack.svg` / `logoonlytextwhite.svg` | Wordmark without the capybara |
| `docs/brand/png/` | PNG exports of the same artwork |

Keep the original proportions and colours. Do not redraw, recolour, outline or add effects to the logo. Leave clear space around it at least the height of the capybara's ear.

## 3. Colour

### Brand accent

| Token | Value | Notes |
|---|---|---|
| `--booki-tan` | `#dfaa75` | Booki's own colour, default accent (`config.rs` `default_accent`) |
| `--accent` | user choice, defaults to tan | Applied by `applyAccent()` in `src/util-color.js` |
| `--accent-contrast` | `#2a2118` | Ink on top of the tan |
| `--danger` | `#c42b1c` | Destructive actions, low battery |

The accent marks the one thing that matters on a surface: the selected option, the running timer ring, the playing level meter, the primary button. Never use it for large fills or body text.

### Where the colours come from (`colorSource`)

Rules live in `src/look-model.js` (pure, unit-tested) and are applied by `paintedLook()` in `src/system-look.js`. Dock, notch and Settings all read colours from there.

| Source | Accent | Dock fill |
|---|---|---|
| `custom` (default for existing setups) | The accent picked in Settings | The glass colour picked in Settings, or the theme surface |
| `windows` | Windows accent (falls back to the wallpaper) | The Windows 11 taskbar: `#1f1f1f` dark, `#eeeeee` light, or a deep accent shade (accent mixed 45% toward black) when Windows shows the accent on the taskbar |
| `wallpaper` | Sampled from the wallpaper | Wallpaper colour mixed 60% toward black (dark) or 72% toward white (light) |

In `windows` and `wallpaper` the source owns the fill in every finish (`surfaceFollows`), like the real taskbar.

### Suggested accents

`src/palette.js` `ACCENT_PALETTE`, shown first wherever an accent is picked. Booki tan leads, followed by Pantone Colors of the Year that sit well beside it (close sRGB matches, not print references):

Booki `#dfaa75` · Mocha Mousse `#a47864` · Peach Fuzz `#ffbe98` · Living Coral `#ff6f61` · Tangerine Tango `#dd4124` · Viva Magenta `#bb2649` · Radiant Orchid `#b163a3` · Very Peri `#6667ab` · Classic Blue `#0f4c81` · Emerald `#009473` · Greenery `#88b04b` · Illuminating `#f5df4d`.

Any other colour stays one click away.

### Glass colour presets

`src/surface.js` `SURFACE_TINT_PRESETS`: black `#000000`, graphite `#1c1c1c`, slate `#2d2d30`, night `#0b1a2a`, white `#f3f3f3`, mocha `#2b211c`, cloud `#f0eee9`. When a custom fill is dark or light enough to fight the theme, `surfaceForeground()` picks the ink (`#1b1b1b` or `#f2f2f2`) so text stays readable.

### Group colours

`src/group-style.js` `GROUP_PALETTE`. Eleven families, each soft / base / deep. Only these are offered so every group stays in Booki's look:

| Family | Soft | Base | Deep |
|---|---|---|---|
| blue | `#8fc2ff` | `#0a84ff` | `#0050b3` |
| indigo | `#aeb3ff` | `#5e5ce6` | `#3634a3` |
| purple | `#dcb0f5` | `#bf5af2` | `#8944ab` |
| pink | `#ffadc0` | `#ff375f` | `#c21e4b` |
| red | `#ffaba3` | `#ff453a` | `#b3261e` |
| orange | `#ffcd8a` | `#ff9f0a` | `#c25e00` |
| yellow | `#fff09a` | `#ffd60a` | `#b38f00` |
| green | `#a6ecb6` | `#30d158` | `#248a3d` |
| teal | `#a8e6ef` | `#40c8e0` | `#0b7f8f` |
| sand | `#eadbc8` | `#c8a27c` | `#8a6a4a` |
| graphite | `#d1d1d6` | `#8e8e93` | `#3a3a3c` |

A group's glyph sits on its colour with `contrastOn()` ink. Without colour or glyph, a group tile shows a grid of its first four items.

### Neutrals

Dock, notch and menus (`src/styles/tokens.css`), Fluent-based:

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#f3f3f3` | `#202020` |
| `--surface-tint` | `#f4f4f7` | `#202024` |
| `--ink` | `#1b1b1b` | `#ffffff` |
| `--ink-2` | `#5d5d5d` | `#c5c5c5` |
| `--ink-3` | `#8a8a8a` | `#9a9a9a` |
| `--stroke` | `rgba(0,0,0,.0578)` | `rgba(255,255,255,.0698)` |
| `--hover` | `rgba(0,0,0,.0373)` | `rgba(255,255,255,.0605)` |

Settings uses its own warm neutrals (`src/styles/settings.css`), tinted toward brown (`rgba(40, 28, 16, …)` strokes):

| Token | Light | Dark |
|---|---|---|
| `--page-bg` | `#f4f2ef` | `#19181b` |
| `--side-bg` | `#ebe8e3` | `#141316` |
| `--card` | `#ffffff` | `#222125` |
| `--ink` | `#1f1c19` | `#f4f1ec` |
| `--ink-2` | `#6d675f` | `#aaa49c` |

### Settings page colours

Each Settings page has one hue (`--page-hue`) for its sidebar tile and section icons, so you always know where you are: Home = accent, Dock `#5e7bff`, Widgets `#ff4f7b`, Apps `#ff9a2e`, System `#8d8a93`. Section icons sit on a 15% tint of that hue.

### Widget colours

Widget tiles are a plate of the surface's own ink over the bar (9% ink in dark, 58% white in light), so they follow every finish and custom tint. Colour comes from each widget's accent (`--w-accent`, defaulting to the iOS system palette or the Booki accent).

## 4. Theme

Settings offers **System**, **Light**, **Dark** and **Auto** (`config.theme`, default `system`).

- `system`: no `data-theme` attribute; the `prefers-color-scheme` media query decides.
- `light` / `dark`: `data-theme` on `<html>` forces it.
- `auto`: light from 07:00 to 19:00, dark otherwise, re-checked every five minutes.
- With `colorSource: "windows"` and theme `system`, the dock and notch follow the **Windows mode** (taskbar, Start) rather than the app mode, because they sit where the taskbar does.
- Settings is an app window: its `system` theme follows the Windows **app** mode.
- A glass colour that forces its own ink (`surfaceForeground()`, for example Dark glass or the taskbar colour) sets the dock and notch windows to the matching theme (`src/theme.js`), so the bar, menus, flyouts and widget plates all agree with the fill.
- An explicit Light theme always paints a light dock. With `colorSource: "windows"`, the accent-taskbar fill applies only when the theme resolves dark.

Every surface (dock, notch, menus, widgets, Settings) must follow the same resolved theme. Mixed light and dark pieces on one screen are a bug, not a style. Marketing uses the light theme; the product keeps both.

High contrast (`forced-colors: active` or `data-high-contrast`) replaces every token with system colours (`Canvas`, `CanvasText`, `Highlight`). Reduced transparency (system setting or `reduceTransparency`) paints the Solid finish without rewriting the saved one.

## 5. Typography

| Token | Stack |
|---|---|
| `--font` | Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui |
| `--font-display` | Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui |

- Product UI uses Windows system type only. No web fonts in the app.
- Settings body text is 14/20, scaled by `--os-text-scale` (Windows Accessibility > Text size). The dock and widgets keep the sizes the user picked.
- Numbers that change (clock, timer, volume) use `font-variant-numeric: tabular-nums`.
- Presentation material (README stills, film) uses Inter, bundled under the SIL OFL in `tools/presentation/fonts/`, because Linux capture hosts lack Segoe UI.

## 6. Shape and spacing

| Token / setting | Value |
|---|---|
| `--r-control` | 4px in dock/menus, 8px in Settings |
| `--r-card` | 8px in dock surfaces, 14px in Settings cards |
| `--r-pill` | 999px |
| Dock tile radius (`cornerRadius`) | 12px default, 0 to 24 |
| Context menu | 12px radius, 5px padding |
| Icon size (`iconSize`) | 28 to 80px, step 4 |
| Item spacing (`spacing`) | 6px default, 0 to 20 |
| Magnification (`zoom`) | 125% default, 110 to 150% |
| Gap to the screen edge (`edgeGap`) | 12px default, 0 to 72 |
| Settings sidebar | 248px |

Nested shapes are concentric: a flyout or menu that sits on the bar uses a radius that matches the bar's curve. Widgets are tiles the height of an app icon in three widths: 1×1 gauges, 2×1 readouts, 3×1 cards.

## 7. Materials (finishes)

One finish for the dock, the notch and their flyouts (`config.surfaceStyle`, `src/surface.js`, `src/material.js`):

| Finish | What it is |
|---|---|
| **Glass** (default) | Windows' real blur behind a translucent fill. `materialStrength` 0 to 100 (default 60) moves it from clear to frosted; fill alpha = 0.30 + strength × 0.62. Native blur is requested only for Glass. |
| **Mica** | Windows 11 Mica: opaque, lightly tinted by the wallpaper (14% `--wall-tint`), no blur. Calm over busy windows. |
| **Solid** | Opaque, theme coloured, no effects. Also what reduced transparency paints. |

Surface details shared by every finish: a 1px light inset on the lit side, a soft shade on the opposite side and a faint sheen that rotates with the dock edge (`--surf-sheen-dir`). Settings uses Mica on Windows 11 (`body.settings-mica`) behind warm cards.

Older finish names (`acrylic`, `tinted`, `liquid`, `island`, `windows`) are read as their closest current finish and migrated on load. Do not add new finish names.

## 8. Motion

Tokens in `tokens.css`:

| Token | Value | Use |
|---|---|---|
| `--ease` / `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Default: strong ease-out |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Things that leave and return |
| `--ease-bounce` | `cubic-bezier(0.34, 1.25, 0.5, 1)` | Small playful overshoot |
| `--notch-spring` | `linear(...)` spring | Notch shape morphs, 0.52s |
| `--dur-1` … `--dur-5` | 0.12, 0.15, 0.18, 0.22, 0.28s | By how much of the screen moves |

Rules:

- Motion explains where something came from. A surface grows out of the thing that opened it; it does not appear from somewhere else.
- **The notch and the dock are one object.** When the dock opens from the notch, or from a live activity in the notch, the capsule stretches into the bar along the dock's edge. It must not read as a second element rising from below. The notch reports its settled shape (`booki://notch-shape`); while it shows a live activity or its card, `src/dock/autohide.js` starts the reveal clipped to that capsule and grows it to the bar over 0.46s. An idle notch keeps the genie.
- Shape changes (tab → live activity → card) change the pill's own size on the spring curve; content layers cross-fade inside it.
- Magnification styles: Spring (default), Smooth, Off.
- `prefers-reduced-motion` cuts every animation to an instant change and stops the level meter. Keep that rule global.

## 9. Components

### Dock

A single bar on any screen edge (`bottom` default), 8px × 10px padding, items with `--gap` spacing. Pinned apps, folders, files and websites, groups, widgets and running apps. Running apps show a small indicator; apps asking for attention flash their tile. Smart auto-hide (default) keeps the dock visible on the desktop and tucks it into the notch when a window covers its area.

### Notch

The small window that stands for the dock while it is tucked away. Click to bring the dock back; drag it to another edge to move both. Three shapes (`notchMode`, `src/notch-mode.js`):

| Shape | At rest | Live activity | Card (hover) |
|---|---|---|---|
| `attached` (default) | Tab flush to the edge, 118 × 13px | 150 × 18px | 300 × 54px glance of what is playing (or the time) |
| `floating` | Same pill, off the edge, with a soft shadow | same | same |
| `smart` | 18px dot | 112 × 24px capsule | 300 × 54px, 22px radius |

Vertical edges swap width and height; the live card exists only on horizontal edges. The dot and tab must always be drawn whole, never clipped by their window. The tab, live capsule and dot use the denser panel fill with no top sheen and no native blur (Windows' blur rectangle, inset from the rounded corners, split them into two bands); only the card and the toast ask for the blur.

Live activities (`act-*` classes): media (cover art + three-bar level meter in the accent), focus timer (progress ring + time), volume (ring + level), done (accent dot + text), low battery (red dot + red text).

### Widgets

Clock, calendar, weather, system (CPU, memory, disk, network), battery, media, volume, notes, clipboard and focus (timer + tasks). Tiles in 1×1, 2×1 and 3×1 widths. Double-click opens configuration or the widget's panel.

### Menus and flyouts

Share the bar's material (`--panel-fill`, `--panel-blur`), 12px radius, thin dividers between sections instead of titles. The hovered row fills with the system blue and turns white, like a native menu.

### Settings

Five pages: **Home, Dock, Widgets, Apps, System**. The dock is the hero, shown live on a small desktop scene. Everything else sits on calm cards with clear section headers and the page hue.

Interaction preferences that are part of the identity:

- Edit **in place**. A group opens in the same space it occupies (the dock strip becomes its members); profiles open in place of their list. Avoid panels that unfold downward.
- Drag out to remove, drag in to add. Resting on a group opens it so you can drop between its members.
- One clear way to add things, with search.

## 10. Voice and copy

- Short, plain sentences. Say what happens, not how clever it is.
- Product and repository communication in English; interface strings in five languages: English, Spanish, Portuguese, French and German (`src/i18n.js` `SUPPORTED`). Every user-facing string goes through `t()` and `npm run check:i18n`.
- No invented claims, metrics or testimonials. Screenshots say when they show sample data or an unreleased build.
- The tagline: **"Your desktop, calmer."**

## 11. Presentation material

- White backgrounds, near-black `#1d1d1f` headlines, neutral `#6e6e73` supporting copy, warm tones from the capybara used sparingly.
- Show the real interface in its light theme with sample data. Browser renders do not prove native Windows behaviour.
- Soft shadows, gentle camera movement, fades to white. One clear idea per scene.
- Finished media lives in `docs/presentation/`; production steps in `tools/presentation/README.md`. Historical native captures stay in `docs/screenshots/`; reference renders of each finish in `docs/quality/reference/`.

## 12. Before shipping UI

- It looks right in light, dark and system themes, in Glass, Mica and Solid, and on all four edges.
- It works with high contrast, reduced transparency and reduced motion.
- Keyboard focus is visible (`:focus-visible` outline in `--ink`).
- New colours come from the tokens or palettes above. New surfaces reuse `--surf-*` / `--panel-*`.
- This page and the shipped identity take precedence over generic design advice.
