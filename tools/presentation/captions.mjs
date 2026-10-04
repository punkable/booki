import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { copy, SCENE, SCENES } from './src/copy.mjs';
/* One caption per scene, so the silent film also reads without the picture. */
export function writeCaptions(out, locale) {
  const c = copy[locale];
  const lines = [c.intro.join('. '), c.desktop.join(' '), c.widgets.join(' '), c.focus.join(' '), c.apps.join(' '), c.home.join(' '), c.dark.join(' '), c.outro.join(' ')];
  const stamp = (s) => `00:00:${String(s).padStart(2, '0')}.000`; const len = SCENE / 30;
  writeFileSync(resolve(out, `booki-070-${locale}.vtt`), 'WEBVTT\n\n' + lines.slice(0, SCENES).map((text, i) => `${stamp(i * len)} --> ${stamp((i + 1) * len)}\n${text}\n`).join('\n'));
}
