import { writeCaptions } from './captions.mjs';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)); const out = resolve(here, '../../docs/presentation');
mkdirSync(out, { recursive: true });
const common = { browserExecutable: process.env.BOOKI_CHROMIUM || undefined, chromiumOptions: { gl: 'swangle' } };
const serveUrl = await bundle({ entryPoint: resolve(here, 'src/index.jsx'), publicDir: resolve(here, 'public') });
const locales = (process.env.BOOKI_FILM_LANGUAGE || 'en,es').split(',');
if (locales.some((l) => !['en', 'es'].includes(l))) throw new Error('BOOKI_FILM_LANGUAGE must list en and/or es.');
// Scene → still published next to the film.
const stills = { 1: 'hero', 2: 'widgets', 3: 'focus', 4: 'apps', 5: 'settings', 6: 'dark' };
for (const locale of locales) {
  for (const [scene, name] of Object.entries(stills)) {
    const inputProps = { scene: Number(scene), locale }; const composition = await selectComposition({ serveUrl, id: 'BookiPoster', inputProps, ...common });
    await renderStill({ serveUrl, composition, inputProps, output: resolve(out, `${name}-${locale}.jpg`), imageFormat: 'jpeg', jpegQuality: 90, ...common });
  }
  console.log(`Rendered ${locale} stills`);
  if (process.env.BOOKI_STILLS_ONLY) continue;
  const inputProps = { locale }; const composition = await selectComposition({ serveUrl, id: 'BookiFilm', inputProps, ...common });
  let last = -1;
  await renderMedia({ serveUrl, composition, inputProps, codec: 'h264', crf: 20, pixelFormat: 'yuv420p', outputLocation: resolve(out, `booki-070-${locale}.mp4`), concurrency: Math.min(cpus().length, Number(process.env.BOOKI_CONCURRENCY) || 4), ...common,
    onProgress: ({ progress }) => { const part = Math.floor(progress * 10); if (part !== last) { last = part; console.log(`${locale} film ${Math.round(progress * 100)}%`); } },
  });
  writeCaptions(out, locale);
}
