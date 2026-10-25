/* Realistic desktop captures for the README and social posts: the real built
   dock (dist/) running over a photo wallpaper. Nothing else is drawn: no
   imitation app windows, only Booki's own surfaces with sample data.

   - Wallpapers are Unsplash photos (Unsplash License), downloaded at capture
     time into the ignored public/stills/ folder; only the composed images
     are committed.
   - App icons use brand marks from Simple Icons (CC0 data; the marks remain
     their owners' trademarks), drawn on a squircle in the brand colour.
   - Everything else is sample data: no personal desktop, files or accounts.

   Run `npm run build` at the repository root first, then
   `node tools/presentation/desktop.mjs`. Writes docs/presentation/desk-*.jpg. */
/* global document, window */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { wallpaper, icons, pathOf, app, CURSOR } from './desk-kit.mjs';
import { serveDist, launchBrowser, openPage, makeConfig } from '../../tests/harness.mjs';
import { bridgePatch, studioPatch } from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../docs/presentation'); mkdirSync(out, { recursive: true });
const fontPath = resolve(here, 'fonts/Inter.ttf');
const CLOCK = '2026-10-21T09:41:00Z';
const NOW = Date.parse(CLOCK);
const SCALE = 1.5;

const widget = (name, style) => ({ id: `w-${name}`, kind: 'widget', widget: name, ...(style ? { style } : {}) });
const sep = (id) => ({ id, kind: 'separator' });

const COVER = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a5a"/><stop offset=".55" stop-color="#e2437a"/><stop offset="1" stop-color="#5b2bb5"/></linearGradient></defs><rect width="64" height="64" fill="url(#a)"/><circle cx="44" cy="22" r="9" fill="#ffd9a8" opacity=".9"/><path d="M0 48 18 34l12 9 14-12 20 15v10H0Z" fill="#2a1747" opacity=".75"/></svg>').toString('base64')}`;
const patch = `(() => { const old = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (cmd, args = {}) => {
    if (cmd === 'media_info') return Promise.resolve({ title: 'Golden Hour', artist: 'Sample Artist', playing: true, thumb: ${JSON.stringify(COVER)}, position_ms: 74000, duration_ms: 212000, source: 'spotify.exe' });
    if (cmd === 'list_windows') return Promise.resolve([{ hwnd: 1, title: 'punkable/booki · GitHub', exe: ${JSON.stringify(pathOf('chrome'))} }, { hwnd: 2, title: 'Design review', exe: ${JSON.stringify(pathOf('chrome'))} }, { hwnd: 3, title: 'Spotify', exe: ${JSON.stringify(pathOf('spotify'))} }, { hwnd: 4, title: 'booki — VSCodium', exe: ${JSON.stringify(pathOf('code'))} }]);
    if (cmd === 'ai_usage') return Promise.resolve([{ id: 'claude', name: 'Claude', detected: true, windows: [{ label: '5h', percent: 38, resets_at: ${NOW / 1000} + 7200 }], week_tokens: 2400000 }]);
    if (cmd === 'device_batteries') return Promise.resolve([{ name: 'MX Master 3S', kind: 'mouse', level: 78, source: 'logitech' }, { name: 'WH-1000XM5', kind: 'headset', level: 64, charging: true, source: 'bluetooth' }]);
    return old(cmd, args);
  }; })();`;
const initScript = bridgePatch(icons) + studioPatch(fontPath, { clock: CLOCK, frozen: true }) + patch;

const { srv, port } = await serveDist();
const browser = await launchBrowser();
const camera = { newPage: (o) => browser.newPage({ ...o, deviceScaleFactor: SCALE, timezoneId: 'UTC' }) };
const problems = [];

/** The notch capsule showing an agent, as a transparent PNG data URI. */
async function notchShot(provider, state) {
  const cfg = makeConfig({ captureVisible: true, theme: 'dark', language: 'en', autoHideMode: 'smart', notchMode: 'floating', notchVisibility: 'always', pinned: [] });
  const { page } = await openPage(camera, port, 'notch.html', { cfg, viewport: { width: 360, height: 100 }, initScript: initScript + `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (cmd, args) => cmd === 'media_info' ? Promise.resolve(null) : old(cmd, args); }` });
  await page.addStyleTag({ content: '#notch-pill { translate: 0 -20px; }' });
  await page.evaluate(({ provider, state }) => { for (const cb of window.__listeners['booki://agent-activity'] || []) cb({ payload: { provider, state, since: Date.now() } }); }, { provider, state });
  await page.waitForTimeout(900);
  const b = await page.locator('#notch-pill').boundingBox();
  const png = await page.screenshot({ omitBackground: true, clip: { x: b.x - 8, y: b.y - 8, width: b.width + 16, height: b.height + 16 } });
  await page.close();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function desktop(file, { wall, theme, pinned, open, panel, notch, cursor, extra = {} }) {
  const cfg = makeConfig({ captureVisible: true, theme, surfaceStyle: 'glass', language: 'en', autoHideMode: 'off', magnification: false, iconSize: 52, pinned, pluginTerms: 1, ...extra });
  const { page, errors } = await openPage(camera, port, 'index.html', { cfg, viewport: { width: 1920, height: 1080 }, initScript });
  await page.evaluate(() => document.fonts.ready);
  const wallUri = await wallpaper(wall);
  await page.addStyleTag({ content: `html { background: url(${wallUri}) center / cover !important; } body { background: transparent !important; }
    #fake-cursor { position: fixed; z-index: 2147483647; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #dock, #stack, .tile { z-index: 10; }` });
  await page.mouse.move(1, 1); await page.waitForTimeout(1500);
  if (open) { await page.locator(`#dock > [data-id="${open}"]`).click(); await page.locator('#stack.open').waitFor(); await page.mouse.move(1, 1); await page.waitForTimeout(700); }
  if (panel) { await page.locator(`#dock > [data-id="${panel}"]`).click(); await page.locator('.system-widget-panel.is-open').waitFor(); await page.mouse.move(1, 1); await page.waitForTimeout(900); }
  // The notch is its own window on Windows; its capture sits at the top edge.
  if (notch) await page.evaluate(({ src, width }) => { const n = document.createElement('img'); n.src = src; n.style.cssText = `position:fixed;top:14px;left:calc(50% - ${width / 2}px);width:${width}px;z-index:20`; document.body.append(n); }, notch);
  if (cursor) await page.evaluate(({ svg, x, y }) => { const c = document.createElement('div'); c.id = 'fake-cursor'; c.innerHTML = svg; c.style.left = `${x}px`; c.style.top = `${y}px`; document.body.append(c); }, { svg: CURSOR, ...cursor });
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  for (const e of errors) problems.push(`${file}: ${e}`);
  await page.close();
}

try {
  const hub = { id: 'grp-day', kind: 'group', name: 'My day', children: [widget('clock'), widget('battery'), widget('devices'), widget('system', { metrics: ['cpu', 'ram'] }), widget('focus', { minutes: 25, endsAt: NOW + 18 * 60 * 1000 }), widget('weather', { city: 'Lisboa', latitude: 38.72, longitude: -9.14 })] };
  const dockLight = [app('chrome', { appWidget: 'wide' }), app('spotify', { appWidget: 'wide' }), app('discord'), app('figma'), app('code'), sep('s1'), hub, sep('s2'), widget('clock'), widget('ai')];
  await desktop(resolve(out, 'desk-hub.jpg'), {
    wall: 'valley', theme: 'light', pinned: dockLight, open: 'grp-day', cursor: { x: 1160, y: 1000 },
  });
  await desktop(resolve(out, 'desk-dark.jpg'), {
    wall: 'peaks', theme: 'dark', pinned: [app('code'), app('chrome', { appWidget: 'wide' }), app('spotify', { appWidget: 'wide' }), app('claude'), app('discord'), sep('s1'), widget('clock'), widget('system', { metrics: ['cpu', 'ram'] }), widget('focus', { minutes: 25, endsAt: NOW + 18 * 60 * 1000 })], cursor: { x: 1060, y: 1040 },
    notch: { src: await notchShot('claude', 'working'), width: 150 },
  });
  const font = readFileSync(fontPath).toString('base64');
  const mark = `data:image/svg+xml;base64,${readFileSync(resolve(here, '../../assets/brand/svg/isotype.svg')).toString('base64')}`;
  const shot = (name) => `data:image/jpeg;base64,${readFileSync(resolve(out, name)).toString('base64')}`;
  const COPY = {
    en: { kicker: 'FREE · OPEN SOURCE · WINDOWS 11', title: ['Your dock,', 'finally alive.'], body: 'Apps, groups and live widgets in one calm bar. Music, windows and your day at a glance, right where your apps are.', chips: ['Live widgets', 'App cards', 'Dynamic notch', 'No account'], cta: 'Download free on GitHub' },
    es: { kicker: 'GRATIS · CÓDIGO ABIERTO · WINDOWS 11', title: ['Tu dock,', 'por fin vivo.'], body: 'Apps, grupos y widgets en vivo en una barra tranquila. Tu música, tus ventanas y tu día de un vistazo, justo donde están tus apps.', chips: ['Widgets en vivo', 'Apps como tarjetas', 'Notch dinámico', 'Sin cuenta'], cta: 'Descárgalo gratis en GitHub' },
  };
  const laptop = (img, width) => `<div style="width:${width}px">
      <div style="padding:${width * 0.018}px;border-radius:${width * 0.03}px ${width * 0.03}px 6px 6px;background:linear-gradient(#2b2b30,#141417);box-shadow:0 50px 100px rgba(60,40,20,.35),inset 0 0 0 2px #3a3a40">
        <img src="${img}" style="display:block;width:100%;border-radius:6px"></div>
      <div style="height:${width * 0.022}px;margin:0 -${width * 0.06}px;border-radius:0 0 ${width * 0.04}px ${width * 0.04}px;background:linear-gradient(#d9d9de,#a9a9b0);box-shadow:0 20px 40px rgba(60,40,20,.25)"></div></div>`;
  const pageHtml = (w, h, inner) => `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Inter; src: url(data:font/ttf;base64,${font}) format('truetype'); font-weight: 100 900; }
    html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
    body { font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; color: #17161a; background:
      radial-gradient(900px 700px at 0% 0%, rgba(255,196,140,.75), transparent 70%), radial-gradient(900px 700px at 100% 10%, rgba(190,210,255,.85), transparent 70%), #f5f0ea; }
    .kick { font-size: 15px; letter-spacing: .22em; color: #8b6a4c; font-weight: 600; }
    h1 { margin: 18px 0 0; font-weight: 780; letter-spacing: -.035em; line-height: .98; }
    h1 span:last-child { color: #c98a4d; display: block; }
    p { color: #57524e; line-height: 1.45; }
    .chip { display: inline-block; padding: 10px 18px; margin: 0 10px 10px 0; border-radius: 40px; background: #ffffffa8; border: 1px solid #fff; font-size: 17px; color: #4c4744; }
    .cta { display: inline-block; padding: 16px 26px; border-radius: 12px; background: #17161a; color: #fff; font-weight: 650; font-size: 19px; }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 750; font-size: 26px; letter-spacing: -.04em; }
  </style></head><body>${inner}</body></html>`;
  const head = (c, size) => `<div class="brand"><img src="${mark}" width="40" height="40">booki</div>
      <div class="kick" style="margin-top:40px">${c.kicker}</div>
      <h1 style="font-size:${size}px"><span>${c.title[0]}</span><span>${c.title[1]}</span></h1>`;
  async function compose(file, w, h, html) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', (e) => problems.push(`${file}: ${e}`));
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    await page.close();
  }
  for (const [lang, c] of Object.entries(COPY)) {
    await compose(resolve(out, `hero-real-${lang}.jpg`), 1920, 1080, pageHtml(1920, 1080, `
      <div style="position:absolute;left:110px;top:150px;width:640px">${head(c, 104)}
        <p style="font-size:24px;margin:28px 0 30px">${c.body}</p>
        <div>${c.chips.map((x) => `<span class="chip">${x}</span>`).join('')}</div>
        <div style="margin-top:26px"><span class="cta">${c.cta}</span></div></div>
      <div style="position:absolute;left:830px;top:230px">${laptop(shot('desk-hub.jpg'), 960)}</div>`));
    await compose(resolve(out, `social-square-${lang}.jpg`), 1080, 1080, pageHtml(1080, 1080, `
      <div style="position:absolute;left:80px;top:70px;right:80px">${head(c, 92)}</div>
      <div style="position:absolute;left:80px;top:470px">${laptop(shot('desk-hub.jpg'), 920)}</div>`));
    await compose(resolve(out, `social-story-${lang}.jpg`), 1080, 1350, pageHtml(1080, 1350, `
      <div style="position:absolute;left:80px;top:80px;right:80px">${head(c, 100)}<p style="font-size:28px;margin-top:26px">${c.body}</p></div>
      <div style="position:absolute;left:110px;top:600px">${laptop(shot('desk-dark.jpg'), 860)}</div>
      <div style="position:absolute;left:80px;bottom:70px"><span class="cta">${c.cta}</span></div>`));
  }
  console.log('Rendered desktop captures');
} finally { await browser.close(); srv.close(); }
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
