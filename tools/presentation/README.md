# Booki presentation

Six reproducible 1920×1080 README stills per language (English and Spanish) and the silent 40-second 0.70 film with its poster frames.

Every product image is a capture of the actual built frontend, driven by safe fixtures in `fixtures.mjs`: generic glyph app icons (no third-party logos), made-up tasks, a clock that starts at 9:41 (frozen at 9:41 for the stills) and example weather, CPU and media data. Windows renders Booki in Segoe UI, which Linux lacks, so captures use Inter, the closest open face. Browser renders do not show native acrylic, Show Desktop, real installed apps or hardware performance. No private configuration, clipboard, notes, third-party artwork or music is captured.

## README stills

The twelve images in `docs/presentation/` (`hero`, `widgets`, `island`, `groups`, `settings` and `dark`, each in `-en` and `-es`, 1920×1080) come from `stills.mjs`. It uses Playwright directly, not Remotion:

```bash
npm ci
npm run build
npm run stills --prefix tools/presentation
```

- It serves `dist/` through the test harness (`tests/harness.mjs`), captures the dock, the notch Island and four Settings pages at 2× with sample data, then lays each still out as an HTML page (wallpaper, headline, captured UI) and screenshots it.
- The clock is frozen at 9:41 on Tuesday 6 October 2026 (`studioPatch(font, { frozen: true })`, pages run in UTC), and the focus timer ends 18 minutes later, so the dock clock, the focus widget and the Island all agree: 9:41, 18:00 and 18:00 on every run.
- The sample dock: Files, Browser, Mail, Music, Photos and Code, a Work group (indigo, lightning icon) and a Play group (orange, gamepad icon), then clock, weather, system, focus and media widgets.
- It exits with an error if a page logs a JavaScript error or a headline overflows its box. Captures go to the ignored `public/stills/`.
- `BOOKI_STILLS_LANGUAGE=en` (or `es`) limits the languages; `BOOKI_CHROMIUM` reuses an installed Chromium.

The Settings preview strip shows the product's own fixed examples (21°, 25:00), not the sample dock's values.

## Film scenes

| # | Scene | Poster frame |
|---|---|---|
| 1 | Intro: logo and tagline | — |
| 2 | Desktop: the dock rises over a soft wallpaper | `hero-*.jpg` |
| 3 | Glide along the bar to the live widgets | `widgets-*.jpg` |
| 4 | Focus: tasks panel and the four new widgets | `focus-*.jpg` |
| 5 | App library window | `apps-*.jpg` |
| 6 | Settings Home window | `settings-*.jpg` |
| 7 | Dark mode desktop | `dark-*.jpg` |
| 8 | Privacy and release card | — |

## Reproduce the film

From the repository root, with the project’s Node version:

```bash
npm ci
npm run build
npm ci --prefix tools/presentation
npm run capture --prefix tools/presentation
npm run render --prefix tools/presentation
```

- `capture.mjs`: wallpapers, dock (light/dark), tasks panel, widget cards and Settings windows into ignored `public/`.
- `src/copy.mjs`: all film copy in both languages; `src/index.jsx`: scenes and motion (30 fps, 5 s per scene).
- `render.mjs`: poster frames, H.264 MP4 and WebVTT captions into `docs/presentation/`. Its poster frames are the older 0.70 set and share file names with the README stills (`hero`, `widgets`, `settings`, `dark`), so run `npm run stills` afterwards to restore them.

Environment: `BOOKI_CHROMIUM` reuses an installed Chrome/headless shell; `BOOKI_FILM_LANGUAGE=en` (or `es`) limits the languages; `BOOKI_STILLS_ONLY=1` skips the films; `BOOKI_CONCURRENCY` sets render workers.

Remotion dependencies are isolated here and never enter Booki's application bundle. Check frames from every scene and the copy against the release status before sharing.
