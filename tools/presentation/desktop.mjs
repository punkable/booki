/* Realistic desktop captures for the README and social posts: the real built
   dock (dist/) running over a photo wallpaper, with mock app windows behind
   it, so the images read like someone's actual desktop.

   - Wallpapers are Unsplash photos (Unsplash License), downloaded at capture
     time into the ignored public/stills/ folder; only the composed images
     are committed.
   - App icons use brand marks from Simple Icons (CC0 data; the marks remain
     their owners' trademarks), drawn on a squircle in the brand colour.
   - Everything else is sample data: no personal desktop, files or accounts.

   Run `npm run build` at the repository root first, then
   `node tools/presentation/desktop.mjs`. Writes docs/presentation/desk-*.jpg. */
/* global document */
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
    if (cmd === 'list_windows') return Promise.resolve([{ hwnd: 1, title: 'Booki — a calmer dock for Windows', exe: ${JSON.stringify(pathOf('chrome'))} }, { hwnd: 2, title: 'Design review', exe: ${JSON.stringify(pathOf('chrome'))} }, { hwnd: 3, title: 'Spotify', exe: ${JSON.stringify(pathOf('spotify'))} }, { hwnd: 4, title: 'booki — VSCodium', exe: ${JSON.stringify(pathOf('code'))} }]);
    if (cmd === 'device_batteries') return Promise.resolve([{ name: 'Headphones', level: 72 }, { name: 'Keyboard', level: 90 }]);
    return old(cmd, args);
  }; })();`;
const initScript = bridgePatch(icons) + studioPatch(fontPath, { clock: CLOCK, frozen: true }) + patch;

/* ── Mock app windows (behind the dock) ─────────────────────────────────── */
const caption = (dark) => `<div style="display:flex;gap:0;margin-left:auto">${['M4 8h8', 'M4 4h8v8H4z', 'M4 4l8 8M12 4l-8 8'].map((d) => `<svg width="46" height="32" viewBox="-15 -8 46 32"><path d="${d}" fill="none" stroke="${dark ? '#ddd' : '#333'}" stroke-width="1"/></svg>`).join('')}</div>`;
function browserWindow({ left, top, width, height, dark }) {
  const bg = dark ? '#202124' : '#ffffff', chrome = dark ? '#2b2c30' : '#e9ecf1', ink = dark ? '#e8eaed' : '#202124', soft = dark ? '#3a3b40' : '#eef0f3';
  return `<div class="win" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:${bg}">
    <div style="display:flex;align-items:end;height:40px;background:${chrome};padding:0 8px">
      <div style="display:flex;align-items:center;gap:8px;height:32px;padding:0 14px;border-radius:10px 10px 0 0;background:${bg};color:${ink};font-size:13px;width:230px"><img src="${icons[pathOf('chrome')]}" width="16">Booki — a calmer dock</div>
      <div style="display:flex;align-items:center;gap:8px;height:32px;padding:0 14px;color:${ink};opacity:.7;font-size:13px;width:180px">Design review</div>${caption(dark)}</div>
    <div style="height:44px;display:flex;align-items:center;padding:0 16px;gap:14px;border-bottom:1px solid ${soft}"><div style="flex:1;height:30px;border-radius:15px;background:${soft};color:${ink};opacity:.75;font-size:13px;display:flex;align-items:center;padding:0 16px">github.com/punkable/booki</div></div>
    <div style="padding:46px 70px;color:${ink}">
      <div style="font-size:44px;font-weight:760;letter-spacing:-.03em">Your desktop, calmer.</div>
      <div style="margin-top:14px;font-size:18px;opacity:.7;max-width:560px;line-height:1.5">A beautiful dock for Windows 11 — apps, folders and live widgets in one calm bar.</div>
      <div style="display:flex;gap:12px;margin-top:28px"><span style="padding:12px 20px;border-radius:8px;background:#dfaa75;color:#2b1d10;font-weight:650;font-size:15px">Download for Windows</span><span style="padding:12px 20px;border-radius:8px;border:1px solid ${soft};font-size:15px">View on GitHub</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px">${[0, 1, 2].map(() => `<div style="height:120px;border-radius:12px;background:${soft}"></div>`).join('')}</div>
    </div></div>`;
}
function editorWindow({ left, top, width, height }) {
  const lines = [
    ['#c586c0', 'import', '#9cdcfe', ' { widgetTile }', '#c586c0', ' from', '#ce9178', ' "./render.js";'],
    ['#6a9955', '// A group with widgets works as a widget hub.'],
    ['#569cd6', 'const', '#4fc1ff', ' hasWidgets', '#d4d4d4', ' = isGroup && items.', '#dcdcaa', 'some', '#d4d4d4', '((it) => it.kind === ', '#ce9178', '"widget"', '#d4d4d4', ');'],
    ['#d4d4d4', 'grid.classList.', '#dcdcaa', 'toggle', '#d4d4d4', '(', '#ce9178', '"widget-hub-grid"', '#d4d4d4', ', hasWidgets);'],
    [], ['#c586c0', 'for', '#d4d4d4', ' (', '#569cd6', 'const', '#9cdcfe', ' it', '#c586c0', ' of', '#9cdcfe', ' items', '#d4d4d4', ') {'],
    ['#d4d4d4', '  ', '#569cd6', 'const', '#4fc1ff', ' tile', '#d4d4d4', ' = ', '#dcdcaa', 'widgetTile', '#d4d4d4', '(it, { inFlyout: ', '#569cd6', 'true', '#d4d4d4', ' });'],
    ['#d4d4d4', '  cell.', '#dcdcaa', 'appendChild', '#d4d4d4', '(tile);'], ['#d4d4d4', '}'],
  ];
  const code = lines.map((l, i) => `<div><span style="display:inline-block;width:46px;color:#6e7681">${i + 12}</span>${l.reduce((s, v, j) => (j % 2 ? s + `<span style="color:${l[j - 1]}">${v.replace(/</g, '&lt;')}</span>` : s), '')}</div>`).join('');
  return `<div class="win" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:#1e1e1e;color:#d4d4d4">
    <div style="display:flex;align-items:center;height:36px;background:#181818;padding-left:14px;font-size:13px;gap:10px"><img src="${icons[pathOf('code')]}" width="16">stack.js — booki — VSCodium${caption(true)}</div>
    <div style="display:flex;height:calc(100% - 36px)"><div style="width:220px;background:#181818;padding:14px;font-size:13px;line-height:2;color:#bbb">BOOKI<br>&nbsp;▸ src-tauri<br>&nbsp;▾ src<br>&nbsp;&nbsp;&nbsp;▾ dock<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;render.js<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#fff;background:#37373d;padding:2px 6px">stack.js</span><br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;notch.js</div>
    <div style="flex:1;padding:18px 10px;font:14px/1.75 'Cascadia Code',Consolas,monospace;white-space:pre">${code}</div></div></div>`;
}

const { srv, port } = await serveDist();
const browser = await launchBrowser();
const camera = { newPage: (o) => browser.newPage({ ...o, deviceScaleFactor: SCALE, timezoneId: 'UTC' }) };
const problems = [];

async function desktop(file, { wall, theme, pinned, windows, open, cursor, extra = {} }) {
  const cfg = makeConfig({ captureVisible: true, theme, surfaceStyle: 'glass', language: 'en', autoHideMode: 'off', magnification: false, iconSize: 52, pinned, pluginTerms: 1, ...extra });
  const { page, errors } = await openPage(camera, port, 'index.html', { cfg, viewport: { width: 1920, height: 1080 }, initScript });
  await page.evaluate(() => document.fonts.ready);
  const wallUri = await wallpaper(wall);
  await page.addStyleTag({ content: `html { background: url(${wallUri}) center / cover !important; } body { background: transparent !important; }
    .win { position: fixed; z-index: 0; border-radius: 9px; overflow: hidden; box-shadow: 0 26px 70px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.08); font-family: BookiStudio, sans-serif; }
    #fake-cursor { position: fixed; z-index: 2147483647; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #dock, #stack, .tile { z-index: 10; }` });
  await page.evaluate((html) => { const host = document.createElement('div'); host.innerHTML = html; document.body.prepend(...host.children); }, windows);
  await page.mouse.move(1, 1); await page.waitForTimeout(1500);
  if (open) { await page.locator(`#dock > [data-id="${open}"]`).click(); await page.locator('#stack.open').waitFor(); await page.mouse.move(1, 1); await page.waitForTimeout(700); }
  if (cursor) await page.evaluate(({ svg, x, y }) => { const c = document.createElement('div'); c.id = 'fake-cursor'; c.innerHTML = svg; c.style.left = `${x}px`; c.style.top = `${y}px`; document.body.append(c); }, { svg: CURSOR, ...cursor });
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  for (const e of errors) problems.push(`${file}: ${e}`);
  await page.close();
}

try {
  const hub = { id: 'grp-day', kind: 'group', name: 'My day', children: [widget('clock'), widget('battery'), widget('focus', { minutes: 25, endsAt: NOW + 18 * 60 * 1000 }), widget('system', { metrics: ['cpu', 'ram'] }), app('notion'), app('obsidian'), app('github')] };
  const dockLight = [app('chrome', { appWidget: 'wide' }), app('spotify', { appWidget: 'wide' }), app('discord'), app('figma'), app('code'), sep('s1'), hub, sep('s2'), widget('weather', { city: 'Lisboa', latitude: 38.72, longitude: -9.14 }), widget('devices')];
  await desktop(resolve(out, 'desk-hub.jpg'), {
    wall: 'valley', theme: 'light', pinned: dockLight, open: 'grp-day', cursor: { x: 1160, y: 1000 },
    windows: browserWindow({ left: 150, top: 70, width: 1080, height: 700, dark: false }),
  });
  await desktop(resolve(out, 'desk-dark.jpg'), {
    wall: 'peaks', theme: 'dark', pinned: [app('code'), app('chrome', { appWidget: 'wide' }), app('spotify', { appWidget: 'wide' }), app('claude'), app('discord'), sep('s1'), widget('clock'), widget('system', { metrics: ['cpu', 'ram'] }), widget('focus', { minutes: 25, endsAt: NOW + 18 * 60 * 1000 })], cursor: { x: 1060, y: 1040 },
    windows: editorWindow({ left: 300, top: 110, width: 1320, height: 560 }),
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
