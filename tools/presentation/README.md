# Booki presentation

A reproducible, silent 30-second product film and four 1920×1080 stills per language (English and Spanish). The visual direction uses Booki's own capybara logo, charcoal surfaces, warm accents, generous spacing and restrained motion. Assets are labelled **0.70 preview** while that release is unpublished.

The screenshots come from the actual built frontend with safe sample apps, usage counts and widget data. They are browser renders, not proof of native Windows materials, Show Desktop, installed-app discovery or hardware performance. No private configuration, clipboard, notes, third-party artwork or music is captured. Text captions accompany the video.

## Reproduce

From the repository root, using the project's required Node version:

```bash
npm ci
npm run build
npx playwright install chromium
npm ci --prefix tools/presentation
npm run capture --prefix tools/presentation
npm run render --prefix tools/presentation
```

Install FFmpeg for the default video encoder. Remotion renders the six original scenes; FFmpeg assembles them with slow camera movement and fades, avoiding repeated software-browser painting of static art. Set `BOOKI_RENDER_ENGINE=browser` to render the film entirely in Remotion instead.

Remotion can download its own headless browser. To reuse an installed Chrome/Chromium instead, set `BOOKI_CHROMIUM` to its absolute executable path. `BOOKI_FILM_LANGUAGE=es` renders the Spanish edition; English is the default.

- `capture.mjs`: fresh English/Spanish screenshots and copies of the official brand SVGs in ignored `public/`.
- `src/index.jsx`: six scenes, 5 seconds each, 30 fps, 1920×1080. Edit copy here.
- `render.mjs` / `encode.mjs`: creates JPG stills, H.264 MP4 and WebVTT captions in `docs/presentation/`.
- Remotion dependencies are isolated here and locked; they never enter Booki's application bundle.

Check the video with `ffprobe`, inspect frames from every scene, and check copy against the release status before sharing. The film is silent by design, with the explanation visible on screen and in captions.

## Useful existing material

Keep `docs/screenshots/`: the earlier native Windows screenshots and GIFs show 0.69 behavior and remain useful reference material. Keep `docs/brand/png/`: original PNG exports are useful to contributors. Neither directory is shipped by Vite.

Generated fixture captures, temporary renders and dependency folders are ignored. Finished presentation assets live in `docs/presentation/`; temporary audit downloads belong outside the repository.
