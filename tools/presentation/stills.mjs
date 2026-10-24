/* README stills: the real built UI with sample data, composited on a soft
   wallpaper with a headline, written to docs/presentation/<name>-<locale>.jpg.

   Plain Playwright, no Remotion: capture each piece of UI from dist/ through
   the test harness, then lay the pieces out on a 1920x1080 HTML page and
   screenshot it. The clock is frozen at 9:41 on a fixed date, and the focus
   timer ends a fixed 18 minutes after that, so the dock's clock, the focus
   widget and the notch pill all agree with each other on every run.

   Run `npm run build` at the repository root first. */
/* global document, window */ // used inside page.evaluate() callbacks, which run in the browser
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serveDist, launchBrowser, openPage, makeConfig } from '../../tests/harness.mjs';
import { iconUri, bridgePatch, studioPatch } from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const shots = resolve(here, 'public/stills'); mkdirSync(shots, { recursive: true });
const out = resolve(here, '../../docs/presentation'); mkdirSync(out, { recursive: true });
const fontPath = resolve(here, 'fonts/Inter.ttf');

// Every page runs in UTC, so this instant reads 9:41 wherever the script runs.
const CLOCK = '2026-10-21T09:41:00Z';
const VERSION = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')).version;
const PREVIEW = process.env.BOOKI_STILLS_PREVIEW === '1';
const NOW = Date.parse(CLOCK);
const FOCUS = { minutes: 25, endsAt: NOW + 18 * 60 * 1000 }; // 18:00 left, everywhere
const SCALE = 3; // capture at 2x so the composited UI stays crisp
const WINDOW = { width: 1180, height: 760 }; // Settings window, shown at 1120 wide

/* Sample apps: generic glyph icons from fixtures.mjs under short names. */
const APPS = {
  files: 'Files', browser: 'Browser', mail: 'Mail', music: 'Music', photos: 'Photos', editor: 'Code',
  chat: 'Chat', terminal: 'Terminal', notes: 'Notes', calendar: 'Calendar', videos: 'Videos', camera: 'Camera',
};
const pathOf = (key) => `C:/Examples/${APPS[key]}.exe`;
const icons = Object.fromEntries(Object.keys(APPS).map((key) => [pathOf(key), iconUri(key)]));
const app = (key) => ({ id: `app-${key}`, kind: 'app', name: APPS[key], path: pathOf(key) });
const separator = (id) => ({ id, kind: 'separator' });
const group = (id, name, color, glyph, keys) => ({ id, kind: 'group', name, style: { color, glyph }, children: keys.map(app) });
const widget = (name, style) => ({ id: `w-${name}`, kind: 'widget', widget: name, ...(style ? { style } : {}) });
// The installed-apps list the Apps page offers ("All apps").
const LIBRARY = ['browser', 'chat', 'editor', 'files', 'mail', 'music', 'photos', 'terminal'];

const PINNED = [
  ...['files', 'browser', 'mail', 'music', 'photos', 'editor'].map(app),
  separator('sep-apps'),
  group('grp-work', 'Work', '#6b69d6', 'zap', ['terminal', 'chat', 'notes', 'calendar']),
  group('grp-play', 'Play', '#f7630c', 'gamepad', ['videos', 'camera', 'music']),
  separator('sep-widgets'),
  widget('clock'),
  widget('weather', { city: 'Lisboa', latitude: 38.72, longitude: -9.14 }),
  widget('system', { metrics: ['cpu', 'ram'] }),
  widget('focus', FOCUS),
  widget('collector'),
  widget('devices'),
];

/* Sample answers on top of fixtures.mjs: the track and the app library. */
const stillsPatch = `(() => { const old = window.__TAURI__.core.invoke;
  const library = ${JSON.stringify(LIBRARY.map((key) => ({ name: APPS[key], path: pathOf(key) })))};
  window.__TAURI__.core.invoke = (cmd, args = {}) => {
    if (cmd === 'media_info') return Promise.resolve({ title: 'Sunset', artist: 'Sample Artist', album: 'Example', playing: true });
    if (cmd === 'running_windows' || cmd === 'list_windows') return Promise.resolve([]);
    if (cmd === 'device_batteries') return Promise.resolve([{ name: 'Headphones', level: 72 }, { name: 'Keyboard', level: 90 }]);
    if (cmd === 'list_installed_apps') return Promise.resolve([{ name: 'Examples', items: library }]);
    if (cmd === 'frequent_apps') return Promise.resolve(library.slice(0, 4).map((item, i) => ({ ...item, runs: 40 - i * 8, focus_ms: (40 - i * 8) * 20000 })));
    return old(cmd, args);
  }; })();`;
const initScript = bridgePatch(icons) + studioPatch(fontPath, { clock: CLOCK, frozen: true }) + stillsPatch;

const { srv, port } = await serveDist();
const browser = await launchBrowser();
const problems = [];
// openPage() calls newPage(); add the 2x scale and the fixed time zone there.
const camera = { newPage: (options) => browser.newPage({ ...options, deviceScaleFactor: SCALE, timezoneId: 'UTC' }) };
const config = (locale, theme, extra = {}) => makeConfig({ captureVisible: true, theme, surfaceStyle: theme === "dark" ? "solid" : "taskbar", language: locale, pinned: PINNED, ...extra });
const open = async (file, cfg, viewport, extraScript = "") => {
  const opened = await openPage(camera, port, file, { cfg, viewport, initScript: initScript + extraScript });
  await opened.page.evaluate(() => document.fonts.ready);
  return opened;
};
const finish = async ({ page, errors }, what) => {
  for (const error of errors) problems.push(`${what}: ${error}`);
  await page.close();
};
const pad = (box, n) => ({ x: box.x - n, y: box.y - n, width: box.width + n * 2, height: box.height + n * 2 });

async function shootDock(locale, theme) {
  const opened = await open('index.html', config(locale, theme), { width: 1900, height: 420 });
  const { page } = opened;
  // Lift the bar off the bottom of the page so its shadow is not cut off.
  await page.addStyleTag({ content: 'body.dock-body { padding-bottom: 70px !important; }' });
  await page.mouse.move(0, 0); await page.waitForTimeout(900);
  const box = await page.locator('#dock').boundingBox();
  const file = resolve(shots, `dock-${theme}-${locale}.png`);
  await page.screenshot({ path: file, omitBackground: true, clip: pad(box, 40) });
  await finish(opened, `dock ${theme} ${locale}`);
  return { file, width: box.width, height: box.height, pad: 40 };
}

async function shootNotch(locale, theme, provider = "claude", state = "working") {
  // The floating capsule, rounded all round, reads as the Island on its own.
  const opened = await open('notch.html', config(locale, theme, { autoHideMode: 'smart', notchMode: 'floating', notchVisibility: 'always', pinned: [] }), { width: 360, height: 100 }, `{
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => cmd === 'media_info' ? Promise.resolve(null) : old(cmd, args);
  }`);
  const { page } = opened;
  // Lift the capsule off the window edge so its shadow is not cut off.
  await page.addStyleTag({ content: '#notch-pill { translate: 0 -20px; }' });
  await page.evaluate(({ provider, state }) => {
    for (const cb of window.__listeners['booki://agent-activity'] || []) cb({ payload: { provider, state, since: Date.now() } });
  }, { provider, state });
  await page.waitForFunction((state) => document.body.classList.contains(state === 'working' ? 'act-agent' : `act-agent-${state}`), state);
  await page.waitForTimeout(700); // let the compact agent capsule settle
  const box = await page.locator('#notch-pill').boundingBox();
  const file = resolve(shots, `notch-${provider}-${state}-${theme}-${locale}.png`);
  await page.screenshot({ path: file, omitBackground: true, clip: pad(box, 12) });
  await finish(opened, `notch ${theme} ${locale}`);
  return { file, width: box.width, height: box.height, pad: 12 };
}

const NAV = {
  home: { en: 'Home', es: 'Inicio' }, dock: { en: 'Dock', es: 'Dock' },
  widgets: { en: 'Widgets', es: 'Widgets' }, apps: { en: 'Apps & folders', es: 'Apps y carpetas' },
};
async function shootSettings(locale, theme, pageName) {
  const opened = await open('settings.html', config(locale, theme), WINDOW);
  const { page } = opened;
  if (pageName !== 'home') {
    await page.getByRole('button', { name: NAV[pageName][locale], exact: true }).first().click();
    await page.waitForTimeout(500);
  }
  if (pageName === 'apps') {
    // Select the Work group, then open its icon picker.
    await page.locator('.library-pin-strip button[aria-label="Work"]').click();
    await page.waitForTimeout(400);
    // Opening a group shows its members; the crumb opens its inspector.
    if (!(await page.locator('.group-look').count())) { await page.locator('.library-crumb-group').click(); await page.waitForTimeout(400); }
    await page.locator('.group-look .look-trigger').nth(1).click();
    await page.waitForTimeout(300);
  }
  await page.mouse.move(1, 1); await page.waitForTimeout(300);
  const file = resolve(shots, `settings-${pageName}-${theme}-${locale}.png`);
  await page.screenshot({ path: file });
  await finish(opened, `settings ${pageName} ${theme} ${locale}`);
  return { file, ...WINDOW };
}

async function shootGroup(locale) {
  const opened = await open('index.html', config(locale, 'light', { autoHideMode: 'off', magnification: false, pinned: [app('files'), app('browser'), group('grp-work', 'Work', '#6b69d6', 'zap', ['terminal', 'chat', 'notes', 'calendar', 'editor', 'mail', 'photos', 'videos']), widget('clock'), widget('system', { metrics: ['cpu', 'ram'] })] }), { width: 1600, height: 700 });
  const { page } = opened;
  await page.locator('#dock > [data-id="grp-work"]').click();
  await page.locator('#stack.open').waitFor();
  await page.mouse.move(1, 1); await page.waitForTimeout(350);
  const dock = await page.locator('#dock').boundingBox(), panel = await page.locator('#stack').boundingBox();
  const box = { x: Math.min(dock.x, panel.x), y: Math.min(dock.y, panel.y), width: Math.max(dock.x + dock.width, panel.x + panel.width) - Math.min(dock.x, panel.x), height: Math.max(dock.y + dock.height, panel.y + panel.height) - Math.min(dock.y, panel.y) };
  const file = resolve(shots, `group-flyout-${locale}.png`);
  await page.screenshot({ path: file, omitBackground: true, clip: pad(box, 20) });
  await finish(opened, `group flyout ${locale}`);
  return { file, width: box.width, height: box.height, pad: 20 };
}

async function shootUtility(locale, kind) {
  const opened = await open('index.html', config(locale, 'dark', { autoHideMode: 'off', pinned: ['clock', 'devices', 'volume', 'ai', 'focus', 'collector'].map((type) => widget(type, type === 'focus' ? FOCUS : {})) }), { width: 1200, height: 820 }, `{
    window.__captureJobs = [];
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => cmd === 'plugin_status' ? Promise.resolve({ installed: true, version: 'sample' }) : cmd === 'plugin_download' ? new Promise((resolve) => window.__captureJobs.push({ args, resolve })) : old(cmd, args);
  }`);
  const { page } = opened;
  let selector;
  if (kind === 'hub') {
    await page.locator('#dock').dispatchEvent('contextmenu', { clientX: 600, clientY: 650 });
    await page.getByRole('menuitem', { name: locale === 'es' ? 'Panel de widgets' : 'Widget panel', exact: true }).click();
    selector = '.widget-hub.is-open';
  } else {
    await page.locator('#dock > [data-id="w-collector"]').click();
    await page.getByRole('textbox', { name: locale === 'es' ? 'Pega un enlace' : 'Paste a link' }).fill('https://example.com/tutorial\nhttps://example.com/guide.pdf');
    await page.getByRole('button', { name: locale === 'es' ? 'Añadir a la cola' : 'Add to queue', exact: true }).click();
    await page.waitForFunction(() => window.__captureJobs.length > 0);
    await page.evaluate(() => { for (const cb of window.__listeners['plugin-download'] || []) cb({ payload: { id: window.__captureJobs[0].args.jobId, state: 'progress', percent: 64, title: 'Design tutorial' } }); });
    selector = '.system-widget-panel.is-open';
    await page.locator('.system-widget-sections').evaluate((el) => { el.scrollTop = 0; });
  }
  await page.locator(selector).waitFor(); await page.mouse.move(1, 1); await page.waitForTimeout(300);
  const box = await page.locator(selector).boundingBox(), file = resolve(shots, `${kind}-${locale}.png`);
  await page.locator(selector).screenshot({ path: file, omitBackground: true });
  await finish(opened, `${kind} ${locale}`);
  return { file, width: box.width, height: box.height, pad: 0 };
}

/* ── Composition ────────────────────────────────────────────────────────── */

const COPY = {
  en: {
    note: PREVIEW ? `Branch preview · base v${VERSION} · example icons and data` : `v${VERSION} · actual interface · example icons and data`,
    hero: [['Your desktop,', 'calmer.'], 'One beautiful dock for your apps, folders and live widgets. Free and open source for Windows 11.'],
    widgets: [['Your tools,', 'together.'], 'Live widgets, quick audio controls and a Collector with an explicit download queue.'],
    island: [['The notch that', 'tells you things.'], 'Claude Code, Codex and Cursor. Their status on your desktop, with local signals and clear indicators.'],
    groups: [['Find. Move.', 'Make it yours.'], 'Search your groups, change views with Ctrl + wheel and see where every shortcut will land.'],
    settings: [['Settings you', 'actually enjoy.'], 'Six clear sections for your dock, widgets, apps, plugins and system.'],
    dark: [['At home in', 'the dark.'], 'Taskbar, glass or solid. Light or dark. Booki follows Windows.'],
  },
  es: {
    note: PREVIEW ? `Vista previa · base v${VERSION} · iconos y datos de ejemplo` : `v${VERSION} · interfaz real · iconos y datos de ejemplo`,
    hero: [['Tu escritorio,', 'más en calma.'], 'Un dock precioso para tus apps, carpetas y widgets en vivo. Gratis y de código abierto para Windows 11.'],
    widgets: [['Tus herramientas,', 'reunidas.'], 'Widgets en vivo, controles de audio y un Recolector con una cola clara de descargas.'],
    island: [['El notch que', 'te cuenta cosas.'], 'Claude Code, Codex y Cursor. Su estado en tu escritorio, con señales locales e indicadores claros.'],
    groups: [['Busca. Mueve.', 'Hazlo tuyo.'], 'Busca dentro de tus grupos, cambia de vista con Ctrl + rueda y ve dónde caerá cada acceso.'],
    settings: [['Ajustes que', 'da gusto usar.'], 'Seis secciones para tu dock, widgets, apps, complementos y sistema.'],
    dark: [['Como en casa', 'a oscuras.'], 'Barra de tareas, vidrio o sólido. Claro u oscuro. Booki sigue a Windows.'],
  },
};

const WALLPAPER = {
  light: `radial-gradient(900px 700px at 8% 0%, rgba(255, 196, 140, .85), transparent 70%),
    radial-gradient(900px 700px at 96% 4%, rgba(190, 210, 255, .95), transparent 70%),
    radial-gradient(1100px 520px at 55% 108%, rgba(245, 200, 225, .8), transparent 70%), #f4efe9`,
  dark: `radial-gradient(900px 640px at 14% 0%, rgba(98, 52, 140, .7), transparent 70%),
    radial-gradient(800px 760px at 92% 34%, rgba(26, 72, 150, .6), transparent 70%),
    radial-gradient(1200px 440px at 50% 108%, rgba(20, 90, 80, .45), transparent 70%), #0e0d12`,
};
const INK = {
  light: { main: '#16161a', soft: '#8f8a86', body: '#55524f', note: '#77736f' },
  dark: { main: '#f6f5f2', soft: '#7c7a80', body: '#c4c3c8', note: '#8c8b92' },
};
const dataUri = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const font = readFileSync(fontPath).toString('base64');
const mark = `data:image/svg+xml;base64,${readFileSync(resolve(here, '../../assets/brand/svg/isotype.svg')).toString('base64')}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A captured piece placed at a CSS size; the PNG holds it at SCALE. */
function piece(shot, { left, top, width, extra = '' }) {
  const k = width / shot.width;
  return `<img src="${dataUri(shot.file)}" style="position:absolute;left:${left - shot.pad * k}px;top:${top - shot.pad * k}px;width:${(shot.width + shot.pad * 2) * k}px;${extra}">`;
}
/** A Settings window, optionally cropped to `crop` CSS pixels of height. */
function windowFrame(shot, { left, top, width, crop, theme }) {
  const k = width / shot.width;
  const height = crop ?? shot.height * k;
  const edge = theme === 'dark' ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.08)';
  const shadow = theme === 'dark' ? '0 40px 90px rgba(0,0,0,.55)' : '0 40px 90px rgba(80,60,40,.18), 0 8px 24px rgba(80,60,40,.08)';
  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border-radius:${16 * k}px;overflow:hidden;box-shadow:${shadow},0 0 0 1px ${edge}">
    <img src="${dataUri(shot.file)}" style="display:block;width:${width}px"></div>`;
}
function headline([main, soft], body, { theme, align, width, size = 118, bodySize = 30 }) {
  const ink = INK[theme];
  return `<div style="width:${width}px;text-align:${align}">
    <h1 style="margin:0;font-size:${size}px;line-height:.98;font-weight:760;letter-spacing:-.03em">
      <span style="display:block;color:${ink.main}">${esc(main)}</span><span style="display:block;color:${ink.soft}">${esc(soft)}</span></h1>
    <p style="margin:${size * 0.32}px ${align === 'center' ? 'auto' : '0'} 0;max-width:${align === 'center' ? 900 : width}px;font-size:${bodySize}px;line-height:1.36;color:${ink.body}">${esc(body)}</p>
  </div>`;
}
function page(theme, note, inner) {
  const ink = INK[theme];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Inter; src: url(data:font/ttf;base64,${font}) format('truetype'); font-weight: 100 900; }
    html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }
    body { position: relative; font-family: Inter, sans-serif; font-feature-settings: 'cv11', 'ss01'; background: ${WALLPAPER[theme]}; -webkit-font-smoothing: antialiased; }
    .note { position: absolute; left: 96px; top: 1021px; font-size: 15px; letter-spacing: .24em; text-transform: uppercase; color: ${ink.note}; }
  </style></head><body><div style="position:absolute;left:96px;top:62px;display:flex;align-items:center;gap:14px;color:${ink.main};font-weight:700;font-size:26px;letter-spacing:-.04em"><img src="${mark}" width="42" height="42" alt="">booki<span style="margin-left:12px;font-size:13px;font-weight:500;letter-spacing:.12em;color:${ink.note}">WINDOWS · OPEN SOURCE</span></div>${inner}<div class="note">${esc(note)}</div></body></html>`;
}

const DOCK_WIDTH = 1720; // the bar spans the frame, 100px in from each side
function compose(name, locale, s) {
  const [title, body] = COPY[locale][name]; const note = COPY[locale].note;
  const dockAt = (shot) => piece(shot, { left: (1920 - DOCK_WIDTH) / 2, top: 970 - shot.height * (DOCK_WIDTH / shot.width), width: DOCK_WIDTH });
  switch (name) {
    case 'hero': {
      const pill = 160;
      return page('light', note, `${piece(s.notch, { left: (1920 - pill) / 2, top: 36, width: pill })}
        <div style="position:absolute;left:0;right:0;top:250px;display:flex;justify-content:center">${headline(title, body, { theme: 'light', align: 'center', width: 1400 })}</div>
        <div style="position:absolute;left:0;right:0;top:680px;display:flex;justify-content:center;gap:16px">
          ${(locale === 'es' ? ['Apps y grupos', 'Widgets en vivo', 'Agentes locales', 'Sin cuenta'] : ['Apps & groups', 'Live widgets', 'Local agents', 'No account']).map((label) => `<span style="padding:14px 22px;border:1px solid #ffffffb3;border-radius:40px;background:#ffffff66;font-size:19px;color:#57524e">${label}</span>`).join('')}
        </div>${dockAt(s.dockLight)}`);
    }
    case 'island': {
      const pill = 230;
      return page('dark', note, `<div style="position:absolute;left:120px;top:205px">${headline(title, body, { theme: 'dark', align: 'left', width: 900 })}</div>
        ${[s.notchDark, s.notchWaiting, s.notchDone].map((shot, i) => piece(shot, { left: 1200, top: 220 + i * 150, width: pill }) + `<span style="position:absolute;left:1480px;top:${242 + i * 150}px;color:#eee;font-size:27px">${['Claude Code', 'Cursor', 'Codex'][i]}</span>`).join('')}
        ${dockAt(s.dockDark)}`);
    }
    case 'groups': return page('light', note, `<div style="position:absolute;left:110px;top:205px">${headline(title, body, { theme: 'light', align: 'left', width: 540, size: 106 })}</div>${piece(s.group, { left: 800, top: 210, width: 900 })}`);
    case 'widgets': return page('dark', note, `<div style="position:absolute;left:110px;top:205px">${headline(title, body, { theme: 'dark', align: 'left', width: 510, size: locale === 'es' ? 76 : 96 })}</div>${piece(s.hub, { left: 700, top: 185, width: 390 })}${piece(s.collector, { left: 1130, top: 160, width: 610 })}`);
    case 'settings': case 'dark': {
      const theme = name === 'widgets' || name === 'dark' ? 'dark' : 'light';
      return page(theme, note, `<div style="position:absolute;left:110px;top:205px">${headline(title, body, { theme, align: 'left', width: 570, size: name === 'dark' ? 98 : 118 })}</div>
        ${windowFrame(s.window, { left: 710, top: 110, width: 1120, theme })}`);
    }
    default: throw new Error(`Unknown still ${name}`);
  }
}

async function render(html, file) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const clipped = await page.evaluate(() => [...document.querySelectorAll('h1, p')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
  for (const text of clipped) problems.push(`${file}: text overflows its box: ${text}`);
  for (const error of errors) problems.push(`${file}: ${error}`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  await page.close();
}

try {
  const locales = (process.env.BOOKI_STILLS_LANGUAGE || 'en').split(',');
  for (const locale of locales) {
    if (!COPY[locale]) throw new Error('BOOKI_STILLS_LANGUAGE must list en and/or es.');
    const dockLight = await shootDock(locale, 'light'), dockDark = await shootDock(locale, 'dark');
    const notchDark = await shootNotch(locale, 'dark');
    const notchWaiting = await shootNotch(locale, 'dark', 'cursor', 'waiting');
    const notchDone = await shootNotch(locale, 'dark', 'codex', 'done');
    const scenes = {
      hero: { dockLight, notch: notchDark }, // the Island reads as dark on any wallpaper
      island: { dockDark, notchDark, notchWaiting, notchDone },
      widgets: { hub: await shootUtility(locale, 'hub'), collector: await shootUtility(locale, 'collector') },
      groups: { group: await shootGroup(locale) },
      settings: { window: await shootSettings(locale, 'light', 'home') },
      dark: { window: await shootSettings(locale, 'dark', 'dock') },
    };
    for (const [name, pieces] of Object.entries(scenes)) {
      await render(compose(name, locale, pieces), resolve(out, `${name}-${locale}.jpg`));
    }
    console.log(`Rendered ${locale} stills`);
  }
} finally { await browser.close(); srv.close(); }
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
