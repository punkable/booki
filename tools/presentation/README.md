# Booki presentation

A reproducible, silent 40-second film and six 1920×1080 stills per language (English and Spanish), used by the READMEs.

Every product image is a capture of the actual built frontend, driven by safe fixtures in `fixtures.mjs`: generic glyph app icons (no third-party logos), made-up tasks, a fixed 9:41 clock and example weather, CPU and media data. Windows renders Booki in Segoe UI, which Linux lacks, so captures use Inter, the closest open face. Browser renders do not show native acrylic, Show Desktop, real installed apps or hardware performance. No private configuration, clipboard, notes, third-party artwork or music is captured.

## Scenes

| # | Scene | Still |
|---|---|---|
| 1 | Intro: logo and tagline | — |
| 2 | Desktop: the dock rises over a soft wallpaper | `hero-*.jpg` |
| 3 | Glide along the bar to the live widgets | `widgets-*.jpg` |
| 4 | Focus: tasks panel and the four new widgets | `focus-*.jpg` |
| 5 | App library window | `apps-*.jpg` |
| 6 | Settings Home window | `settings-*.jpg` |
| 7 | Dark mode desktop | `dark-*.jpg` |
| 8 | Privacy and release card | — |

## Reproduce

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
- `render.mjs`: stills, H.264 MP4 and WebVTT captions into `docs/presentation/`.

Environment: `BOOKI_CHROMIUM` reuses an installed Chrome/headless shell; `BOOKI_FILM_LANGUAGE=en` (or `es`) limits the languages; `BOOKI_STILLS_ONLY=1` skips the films; `BOOKI_CONCURRENCY` sets render workers.

Remotion dependencies are isolated here and never enter Booki's application bundle. Check frames from every scene and the copy against the release status before sharing.
