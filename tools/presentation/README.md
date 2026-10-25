# Booki presentation

Six reproducible 1920×1080 README stills per language (English and Spanish) and the silent 40-second 0.70 film with its poster frames.

Every product image is a capture of the actual built frontend, driven by safe fixtures in `fixtures.mjs`: generic glyph app icons (no third-party logos), made-up tasks, a clock that starts at 9:41 (frozen at 9:41 for the stills) and example weather, CPU and media data. Windows renders Booki in Segoe UI, which Linux lacks, so captures use Inter, the closest open face. Browser renders do not show native acrylic, Show Desktop, real installed apps or hardware performance. No private configuration, clipboard, notes, third-party artwork or music is captured.

## README stills

The current twelve README images are composed screenshots of the actual frontend, generated through `scripts/capture-release.mjs` and `stills.mjs`. They use the Booki mark, Inter, offline coloured app placeholders, example data and current agent marks. No installed-app list or personal desktop is captured.

For a branch that includes unpublished interface changes:

```bash
npm ci
npm run build
node scripts/release-docs.mjs --sync --preview
node scripts/capture-release.mjs --preview
```

The images and README captions explicitly say preview, while download links and the recent-update table continue to describe the current stable release. A preview manifest intentionally fails `npm run release:check`.

For an approved release, first update versions and changelog, then run `npm run release:prepare`. This synchronizes both READMEs, captures all twelve images and verifies their source fingerprint and SHA-256 values. The fingerprint includes capture composition, fixtures and font files. Follow the complete [release process](../../docs/distribution/release-process.md), including Windows validation.

`stills.mjs` captures the dock, the agent notch and Settings at 3×, then lays those captures into 1920×1080 compositions. It checks for JavaScript errors and overflowing headings. Temporary UI pieces live in ignored `public/stills/`. `BOOKI_CHROMIUM` reuses an installed browser. Do not overwrite the current README images with historical film poster frames.

## Realistic desktop and social images

`desktop.mjs` and `clips.mjs` share `desk-kit.mjs` (wallpapers, brand icons, drawn pointer). `desktop.mjs` runs the real built dock over an Unsplash photo wallpaper (Unsplash License, downloaded into the ignored `public/stills/` at capture time) with mock app windows behind it and brand icons from Simple Icons (CC0 data; the marks belong to their owners). It writes `desk-hub.jpg`, `desk-dark.jpg`, the laptop hero `hero-real-{en,es}.jpg` and social formats `social-square-*` (1080×1080) and `social-story-*` (1080×1350). Run `npm run build` at the root, then `node tools/presentation/desktop.mjs`.

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
- `render.mjs`: poster frames, H.264 MP4 and WebVTT captions into `docs/presentation/`. Its poster frames are the older 0.70 set and share file names with the README stills (`hero`, `widgets`, `settings`, `dark`), so run the current capture workflow afterwards to restore them.

Environment: `BOOKI_CHROMIUM` reuses an installed Chrome/headless shell; `BOOKI_FILM_LANGUAGE=en` (or `es`) limits the languages; `BOOKI_STILLS_ONLY=1` skips the films; `BOOKI_CONCURRENCY` sets render workers.

Remotion dependencies are isolated here and never enter Booki's application bundle. Check frames from every scene and the copy against the release status before sharing.
