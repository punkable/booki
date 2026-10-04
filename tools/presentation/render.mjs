import { writeCaptions } from './captions.mjs';
import { encodeFilm } from './encode.mjs';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)); const out = resolve(here, '../../docs/presentation');
mkdirSync(out, { recursive: true });
const browserExecutable = process.env.BOOKI_CHROMIUM || undefined;
const common = { browserExecutable, chromiumOptions: { gl: 'swangle' } };
let serveUrl = await bundle({ entryPoint: resolve(here, 'src/index.jsx'), publicDir: resolve(here, 'public') });
const locale = process.env.BOOKI_FILM_LANGUAGE || 'en';
if (!['en', 'es'].includes(locale)) throw new Error('BOOKI_FILM_LANGUAGE must be en or es.');
const scenes = process.env.BOOKI_SCENES ? process.env.BOOKI_SCENES.split(',').map(Number) : [0, 1, 2, 3, 4, 5];
if (scenes.some((scene) => !Number.isInteger(scene) || scene < 0 || scene > 5)) throw new Error('BOOKI_SCENES must contain scene numbers 0–5.');
for (const scene of scenes) {
  const inputProps = { scene, locale }; const composition = await selectComposition({ serveUrl, id: 'BookiPoster', inputProps, ...common });
  const output = resolve(here, `public/scene-${scene}-${locale}.jpg`);
  await renderStill({ serveUrl, composition, inputProps, output, imageFormat: 'jpeg', jpegQuality: 92, ...common });
  const name = [null, 'hero', 'widgets', 'apps', 'settings', null][scene];
  if (name) copyFileSync(output, resolve(out, `${name}-${locale}.jpg`));
  console.log(`Rendered scene ${scene + 1}/6`);
}
if (process.env.BOOKI_RENDER_ENGINE === 'browser') {
  // Bake static art once; the film animates those frames rather than repainting
  // large gradients and screenshot shadows for every frame on software renderers.
  serveUrl = await bundle({ entryPoint: resolve(here, 'src/index.jsx'), publicDir: resolve(here, 'public') });
  const inputProps = { locale, baked: true }; const composition = await selectComposition({ serveUrl, id: 'BookiFilm', inputProps, ...common });
  let last = -1;
  await renderMedia({ serveUrl, composition, inputProps, codec: 'h264', crf: 23, pixelFormat: 'yuv420p', outputLocation: resolve(out, `booki-070-preview-${locale}.mp4`), concurrency: 2, ...common,
    onProgress: ({ progress }) => { const part = Math.floor(progress * 10); if (part !== last) { last = part; console.log(`Video ${Math.round(progress * 100)}%`); } },
  });
} else {
  encodeFilm(here, out, locale);
}
writeCaptions(out, locale);
console.log('Video and captions rendered.');
