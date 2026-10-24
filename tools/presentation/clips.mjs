/* README clips: short animated WebP loops recorded from the real built UI
   with sample data. Playwright records each scene as video; ffmpeg turns it
   into a small looping WebP in docs/presentation/. English only.

   Run `npm run build` at the repository root first. Needs ffmpeg on PATH. */
/* global document, window */
import { mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serveDist, launchBrowser, openPage, makeConfig } from '../../tests/harness.mjs';
import { iconUri, bridgePatch, studioPatch } from './fixtures.mjs';

globalThis.__readFile = (p) => readFileSync(p);
const here = dirname(fileURLToPath(import.meta.url));
const tmp = resolve(here, 'public/clips'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
const out = resolve(here, '../../docs/presentation');
const fontPath = resolve(here, 'fonts/Inter.ttf');

const APPS = { files: 'Files', browser: 'Browser', mail: 'Mail', music: 'Music', photos: 'Photos', editor: 'Code', chat: 'Chat', terminal: 'Terminal', notes: 'Notes', calendar: 'Calendar', videos: 'Videos', camera: 'Camera' };
const pathOf = (key) => `C:/Examples/${APPS[key]}.exe`;
const icons = Object.fromEntries(Object.keys(APPS).map((key) => [pathOf(key), iconUri(key)]));
const app = (key) => ({ id: `app-${key}`, kind: 'app', name: APPS[key], path: pathOf(key) });
const widget = (name, style) => ({ id: `w-${name}`, kind: 'widget', widget: name, ...(style ? { style } : {}) });
const sample = `(() => { const old = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (cmd, args = {}) => {
    if (cmd === 'device_batteries') return Promise.resolve([{ name: 'MX Master 3S', kind: 'mouse', level: 78, source: 'logitech' }, { name: 'MX Keys Mini', kind: 'keyboard', level: 18, source: 'logitech' }, { name: 'WH-1000XM5', kind: 'headset', level: 64, charging: true, source: 'bluetooth' }]);
    if (cmd === 'running_windows' || cmd === 'list_windows') return Promise.resolve([]);
    return old(cmd, args);
  }; })();`;
const init = bridgePatch(icons) + studioPatch(fontPath, { clock: '2026-10-21T09:41:00Z' }) + sample;
const wallpaper = `body { background: radial-gradient(120% 90% at 0% 0%, #f6c7a1, transparent 60%), radial-gradient(120% 90% at 100% 100%, #a9c1ff, transparent 60%), #efe9f2 !important; }`;

const { srv, port } = await serveDist();
const browser = await launchBrowser();
async function record(name, file, cfg, viewport, scene) {
  const dir = resolve(tmp, name); mkdirSync(dir);
  const camera = { newPage: (options) => browser.newPage({ ...options, timezoneId: 'UTC', recordVideo: { dir, size: viewport } }) };
  const { page, errors } = await openPage(camera, port, file, { cfg: makeConfig({ language: 'en', captureVisible: true, ...cfg }), viewport, initScript: init });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: wallpaper });
  await page.waitForTimeout(600);
  const start = Date.now();
  await scene(page);
  const length = (Date.now() - start) / 1000;
  await page.close();
  if (errors.length) console.warn(name, errors);
  const video = resolve(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
  const target = resolve(out, `clip-${name}.webp`);
  const width = name === 'notch' ? 760 : 960;
  // Skip the page load at the start; 30 fps, 960 px wide, looping WebP.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', `-${length.toFixed(2)}`, '-i', video,
    '-vf', `fps=30,scale=${width}:-2:flags=lanczos`, '-loop', '0', '-c:v', 'libwebp_anim', '-quality', '78', '-compression_level', '6', target]);
  console.log(`clip-${name}.webp`);
}
const pause = (page, ms) => page.waitForTimeout(ms);

// 1. Magnification following the pointer across the bar.
await record('magnify', 'index.html', { theme: 'light', surfaceStyle: 'glass', autoHideMode: 'off', zoom: 1.6, pinned: ['files', 'browser', 'mail', 'music', 'photos', 'editor', 'chat', 'terminal', 'notes', 'calendar'].map(app) }, { width: 1100, height: 300 }, async (page) => {
  const box = await page.locator('#dock').boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x - 40, y);
  await page.mouse.move(box.x + box.width + 20, y, { steps: 90 });
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 60 });
  await pause(page, 500);
  await page.mouse.move(box.x + box.width * 0.3, box.y - 120, { steps: 20 });
  await pause(page, 700);
});

// 2. A widget opens its details with one click.
await record('widgets', 'index.html', { theme: 'dark', surfaceStyle: 'glass', autoHideMode: 'off', pinned: [widget('clock'), widget('devices'), widget('system', { metrics: ['cpu', 'ram'] }), widget('volume')] }, { width: 900, height: 560 }, async (page) => {
  await pause(page, 600);
  const tile = page.locator('[data-id="w-devices"]');
  const b = await tile.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await pause(page, 300);
  await tile.click();
  await pause(page, 1600);
  await page.keyboard.press('Escape');
  await pause(page, 700);
});

// 3. The widget gallery: add one, then tune it in the side sheet.
await record('gallery', 'settings.html', { theme: 'light', pinned: [widget('clock'), widget('devices')] }, { width: 1180, height: 760 }, async (page) => {
  await page.getByRole('navigation').getByText('Widgets', { exact: true }).click();
  await pause(page, 1200);
  const add = page.locator('.catalog-card').filter({ hasText: 'Weather' }).getByRole('button', { name: /Add/ });
  const b = await add.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
  await pause(page, 300);
  await add.click();
  await pause(page, 1300);
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await pause(page, 900);
  await page.locator('.widget-sheet .swatch').nth(9).click();
  await pause(page, 1400);
});

// 4. The notch follows local agents: working, waiting, done.
await record('notch', 'notch.html', { theme: 'dark', notchMode: 'floating', notchVisibility: 'always', autoHideMode: 'smart', pinned: [] }, { width: 380, height: 96 }, async (page) => {
  await page.addStyleTag({ content: 'body { background: #1b1b22 !important; } #notch-pill { translate: 0 -24px; }' });
  await page.evaluate(() => { const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (cmd, args) => cmd === 'media_info' ? Promise.resolve(null) : old(cmd, args); });
  const send = (provider, state) => page.evaluate(({ provider, state }) => { for (const cb of window.__listeners['booki://agent-activity'] || []) cb({ payload: { provider, state, since: Date.now() } }); }, { provider, state });
  for (const [provider, state] of [['claude', 'working'], ['claude', 'waiting'], ['codex', 'working'], ['claude', 'done']]) { await send(provider, state); await pause(page, 1500); }
});

await browser.close(); srv.close();
rmSync(tmp, { recursive: true, force: true });
