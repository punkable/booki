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
import { bridgePatch, studioPatch } from './fixtures.mjs';
import { icon as glyph } from '../../src/icons.js';
import { APPS as KIT_APPS, pathOf as kitPath, icons as kitIcons } from './desk-kit.mjs';

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

/* Sample apps: brand marks on squircles (desk-kit.mjs, Simple Icons). */
const APPS = Object.fromEntries(Object.entries(KIT_APPS).map(([key, [name]]) => [key, name]));
const pathOf = kitPath;
const icons = kitIcons;
const app = (key) => ({ id: `app-${key}`, kind: 'app', name: APPS[key], path: pathOf(key) });
const separator = (id) => ({ id, kind: 'separator' });
const group = (id, name, color, glyph, keys) => ({ id, kind: 'group', name, style: { color, glyph }, children: keys.map(app) });
const widget = (name, style) => ({ id: `w-${name}`, kind: 'widget', widget: name, ...(style ? { style } : {}) });
// The installed-apps list the Apps page offers ("All apps").
const LIBRARY = ['chrome', 'discord', 'code', 'figma', 'notion', 'spotify', 'obsidian', 'github'];

const PINNED = [
  ...['chrome', 'spotify', 'discord', 'figma', 'notion', 'code'].map(app),
  separator('sep-apps'),
  group('grp-work', 'Work', '#6b69d6', 'zap', ['obsidian', 'github', 'claude', 'telegram']),
  group('grp-play', 'Play', '#f7630c', 'gamepad', ['steam', 'vlc', 'blender']),
  separator('sep-widgets'),
  widget('clock'),
  widget('weather', { city: 'Lisboa', latitude: 38.72, longitude: -9.14 }),
  widget('system', { metrics: ['cpu', 'ram'] }),
  widget('focus', FOCUS),
  widget('ai'),
  widget('devices'),
];

/* Sample answers on top of fixtures.mjs: the track and the app library. */
const stillsPatch = `(() => { const old = window.__TAURI__.core.invoke;
  const library = ${JSON.stringify(LIBRARY.map((key) => ({ name: APPS[key], path: pathOf(key) })))};
  window.__TAURI__.core.invoke = (cmd, args = {}) => {
    if (cmd === 'media_info') return Promise.resolve({ title: 'Sunset', artist: 'Sample Artist', album: 'Example', playing: true });
    if (cmd === 'running_windows' || cmd === 'list_windows') return Promise.resolve([]);
    if (cmd === 'device_batteries') return Promise.resolve([{ name: 'MX Master 3S', kind: 'mouse', level: 78, source: 'logitech' }, { name: 'MX Keys Mini', kind: 'keyboard', level: 18, source: 'logitech' }, { name: 'WH-1000XM5', kind: 'headset', level: 64, charging: true, source: 'bluetooth' }]);
    if (cmd === 'ai_usage') return Promise.resolve([{ id: 'claude', name: 'Claude', detected: true, windows: [{ label: '5h', percent: 38, resets_at: ${NOW / 1000} + 7200 }, { label: 'week', percent: 61, resets_at: ${NOW / 1000} + 300000 }], week_tokens: 2400000 }, { id: 'codex', name: 'Codex', detected: true, windows: [{ label: '5h', percent: 22, resets_at: ${NOW / 1000} + 9000 }], week_tokens: 640000 }]);
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
  // Where the apps, groups and widgets sit, relative to the bar (anatomy).
  const parts = await page.evaluate((dock) => {
    const span = (sel) => { const r = [...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect()); if (!r.length) return null; const l = Math.min(...r.map((x) => x.left)), rr = Math.max(...r.map((x) => x.right)); return { x: l - dock.x, width: rr - l }; };
    return { apps: span('#dock > .tile[data-id]:not(.group):not(.widget):not(.separator)'), groups: span('#dock > .tile.group'), widgets: span('#dock > .tile.widget') };
  }, box);
  const file = resolve(shots, `dock-${theme}-${locale}.png`);
  await page.screenshot({ path: file, omitBackground: true, clip: pad(box, 40) });
  await finish(opened, `dock ${theme} ${locale}`);
  return { file, width: box.width, height: box.height, pad: 40, parts };
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
  const opened = await open('index.html', config(locale, 'light', { autoHideMode: 'off', magnification: false, pinned: [app('chrome'), app('spotify'), group('grp-work', 'Work', '#6b69d6', 'zap', ['code', 'github', 'figma', 'notion', 'obsidian', 'claude', 'discord', 'telegram']), widget('clock'), widget('system', { metrics: ['cpu', 'ram'] })] }), { width: 1600, height: 700 });
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

/** A widget's real detail panel, opened by clicking it on the dock. */
async function shootPanel(locale, type, theme = 'dark') {
  const opened = await open('index.html', config(locale, theme, { surfaceStyle: 'glass', autoHideMode: 'off', pinned: ['clock', 'devices', 'ai', 'volume'].map((name) => widget(name)) }), { width: 1200, height: 900 });
  const { page } = opened;
  await page.locator(`#dock > [data-id="w-${type}"]`).click();
  const selector = '.system-widget-panel.is-open';
  await page.locator(selector).waitFor(); await page.mouse.move(1, 1); await page.waitForTimeout(900);
  const box = await page.locator(selector).boundingBox(), file = resolve(shots, `panel-${type}-${theme}-${locale}.png`);
  await page.locator(selector).screenshot({ path: file, omitBackground: true });
  await finish(opened, `${type} panel ${locale}`);
  return { file, width: box.width, height: box.height, pad: 0 };
}

/* ── Composition ────────────────────────────────────────────────────────── */

const COPY = {
  en: {
    note: PREVIEW ? `Branch preview · base v${VERSION} · example icons and data` : `v${VERSION} · actual interface · example icons and data`,
    hero: [['Your desktop,', 'calmer.'], 'One beautiful dock for your apps, folders and live widgets. Free and open source for Windows 11.'],
    widgets: [['One click,', 'the whole story.'], 'Every widget opens into its details: the battery of each device, your AI plan with its reset times.'],
    island: [['The notch that', 'tells you things.'], 'Claude, Codex and Cursor: working, waiting for you or done. Read from local signals only.'],
    groups: [['Find. Move.', 'Make it yours.'], 'Groups with their own colour and icon. Search inside one and switch icon sizes with Ctrl + wheel.'],
    settings: [['Settings you', 'actually enjoy.'], 'Clear pages for your dock, notch, widgets and apps, with a live preview of your dock.'],
    dark: [['At home in', 'the dark.'], 'Taskbar, glass or solid. Light or dark. Booki follows Windows.'],
  },
  es: {
    note: PREVIEW ? `Vista previa · base v${VERSION} · iconos y datos de ejemplo` : `v${VERSION} · interfaz real · iconos y datos de ejemplo`,
    hero: [['Tu escritorio,', 'más en calma.'], 'Un dock precioso para tus apps, carpetas y widgets en vivo. Gratis y de código abierto para Windows 11.'],
    widgets: [['Un clic,', 'todo el detalle.'], 'Cada widget se abre en su detalle: la batería de cada dispositivo y tu plan de IA con sus reinicios.'],
    island: [['El notch que', 'te cuenta cosas.'], 'Claude, Codex y Cursor: trabajando, esperándote o listos. Solo con señales locales.'],
    groups: [['Busca. Mueve.', 'Hazlo tuyo.'], 'Grupos con su color e icono. Busca dentro y cambia el tamaño de los iconos con Ctrl + rueda.'],
    settings: [['Ajustes que', 'da gusto usar.'], 'Páginas claras para tu dock, notch, widgets y apps, con una vista previa en vivo.'],
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
    case 'widgets': return page('dark', note, `<div style="position:absolute;left:110px;top:205px">${headline(title, body, { theme: 'dark', align: 'left', width: 560, size: locale === 'es' ? 84 : 100 })}</div>${piece(s.devices, { left: 760, top: 150, width: 500 })}${piece(s.ai, { left: 1300, top: 230, width: 500 })}`);
    case 'settings': case 'dark': {
      const theme = name === 'widgets' || name === 'dark' ? 'dark' : 'light';
      return page(theme, note, `<div style="position:absolute;left:110px;top:205px">${headline(title, body, { theme, align: 'left', width: 570, size: name === 'dark' ? 98 : 118 })}</div>
        ${windowFrame(s.window, { left: 710, top: 110, width: 1120, theme })}`);
    }
    default: throw new Error(`Unknown still ${name}`);
  }
}

/* ── Explainers: the real interface with thin labels, no drawn stand-ins ── */

const LABEL = {
  en: {
    anatomy: ['The parts of Booki', 'Everything below is the actual interface.'],
    notch: ['Notch', 'Music, focus timer, battery and AI agents at a glance.'],
    panel: ['Widget details', 'One click on a widget opens its panel.'],
    apps: ['Apps', 'Grow under the pointer.'], groups: ['Groups', 'Your colour and icon.'], widgets: ['Live widgets', 'Right on the bar.'],
    privacy: ['AI usage stays on your PC', 'Booki reads only what your AI tools already write on this PC.'],
    reads: 'Reads', never: 'Never',
    readList: [['file', 'Claude Code and Codex session logs'], ['activity', 'Claude Code status line, if you opt in'], ['zap', 'Agent events: kind only, never the text'], ['clock', 'File size and time for Cursor, the Claude app and others']],
    neverList: [['lock', 'Sign-ins, tokens or cookies'], ['shield', 'Account or credential files'], ['globe', 'Network requests for AI usage'], ['alert', 'Made-up quota percentages']],
  },
  es: {
    anatomy: ['Las partes de Booki', 'Todo lo de abajo es la interfaz real.'],
    notch: ['Notch', 'Música, temporizador, batería y agentes de IA de un vistazo.'],
    panel: ['Detalle de widgets', 'Un clic en un widget abre su panel.'],
    apps: ['Apps', 'Crecen bajo el cursor.'], groups: ['Grupos', 'Tu color y tu icono.'], widgets: ['Widgets en vivo', 'En la misma barra.'],
    privacy: ['El uso de IA se queda en tu PC', 'Booki solo lee lo que tus herramientas de IA ya escriben en este PC.'],
    reads: 'Lee', never: 'Nunca',
    readList: [['file', 'Registros de sesión de Claude Code y Codex'], ['activity', 'Barra de estado de Claude Code, si lo activas'], ['zap', 'Eventos de agentes: solo el tipo, nunca el texto'], ['clock', 'Tamaño y hora de archivo de Cursor, la app de Claude y otros']],
    neverList: [['lock', 'Inicios de sesión, tokens o cookies'], ['shield', 'Archivos de cuenta o credenciales'], ['globe', 'Peticiones de red para el uso de IA'], ['alert', 'Porcentajes de cuota inventados']],
  },
};
const callout = ({ x, y, side = 'right', title, text, width = 300 }) => {
  const right = side === 'right';
  return `<div style="position:absolute;left:${right ? x : x - width}px;top:${y}px;width:${width}px;text-align:${right ? 'left' : 'right'}">
    <div style="font-size:22px;font-weight:680;color:#1c1a19;letter-spacing:-.01em">${esc(title)}</div>
    <div style="margin-top:4px;font-size:17px;line-height:1.4;color:#6b6560">${esc(text)}</div></div>`;
};
const line = (x1, y1, x2, y2) => `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1"><path d="M${x1} ${y1} L${x2} ${y2}" stroke="#1c1a19" stroke-opacity=".28" stroke-width="1.2" fill="none"/><circle cx="${x1}" cy="${y1}" r="4.5" fill="#c98a4d" stroke="#fff" stroke-width="2"/></svg>`;

function anatomy(locale, s) {
  const c = LABEL[locale];
  const k = DOCK_WIDTH / s.dockLight.width, dockLeft = (1920 - DOCK_WIDTH) / 2, dockTop = 780;
  const dockBottom = dockTop + s.dockLight.height * k;
  const at = (part) => dockLeft + (part.x + part.width / 2) * k;
  const pill = 170, pillTop = 150, pillLeft = (1920 - pill) / 2;
  const panelW = 400, panelLeft = 300, panelTop = 268;
  const parts = [['apps', s.dockLight.parts.apps], ['groups', s.dockLight.parts.groups], ['widgets', s.dockLight.parts.widgets]].filter(([, p]) => p);
  return page('light', COPY[locale].note, `<div style="position:absolute;left:96px;top:150px;width:560px">
      <h1 style="margin:0;font-size:58px;line-height:1.02;font-weight:760;letter-spacing:-.03em;color:#16161a">${esc(c.anatomy[0])}</h1>
      <p style="margin:14px 0 0;font-size:22px;color:#6b6560">${esc(c.anatomy[1])}</p></div>
    ${piece(s.notch, { left: pillLeft, top: pillTop, width: pill })}
    ${line(pillLeft + pill + 14, pillTop + 22, pillLeft + pill + 90, pillTop + 22)}${callout({ x: pillLeft + pill + 104, y: pillTop + 2, title: c.notch[0], text: c.notch[1], width: 560 })}
    ${piece(s.panel, { left: panelLeft, top: panelTop, width: panelW })}
    ${line(panelLeft + panelW + 14, panelTop + 70, panelLeft + panelW + 90, panelTop + 70)}${callout({ x: panelLeft + panelW + 104, y: panelTop + 48, title: c.panel[0], text: c.panel[1], width: 360 })}
    ${piece(s.dockLight, { left: dockLeft, top: dockTop, width: DOCK_WIDTH })}
    ${parts.map(([key, p]) => { const x = at(p); return `${line(x, dockBottom + 10, x, dockBottom + 46)}<div style="position:absolute;left:${x - 160}px;top:${dockBottom + 54}px;width:320px;text-align:center"><span style="font-size:21px;font-weight:680;color:#1c1a19">${esc(c[key][0])}</span><span style="font-size:17px;color:#6b6560"> · ${esc(c[key][1])}</span></div>`; }).join('')}`);
}

function privacy(locale, s) {
  const c = LABEL[locale];
  const row = ([g, text], tone) => `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;background:${tone === 'never' ? '#fff5f4' : '#ffffffb8'};border:1px solid ${tone === 'never' ? '#f3d4d0' : '#ffffff'}">
      <span style="flex:none;width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:${tone === 'never' ? '#fbe3e0' : '#f3e7da'};color:${tone === 'never' ? '#b4232f' : '#8b5a2b'}">${glyph(g)}</span>
      <span style="font-size:19px;line-height:1.3;color:#2a2725">${esc(text)}</span></div>`;
  const column = (title, list, tone) => `<div style="width:520px"><div style="margin:0 0 14px 4px;font-size:16px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tone === 'never' ? '#b4232f' : '#8b6a4c'}">${esc(title)}</div>
      <div style="display:grid;gap:10px">${list.map((item) => row(item, tone)).join('')}</div></div>`;
  return page('light', COPY[locale].note, `<div style="position:absolute;left:0;right:0;top:150px;text-align:center">
      <h1 style="margin:0;font-size:64px;line-height:1.02;font-weight:760;letter-spacing:-.03em;color:#16161a">${esc(c.privacy[0])}</h1>
      <p style="margin:16px 0 0;font-size:24px;color:#6b6560">${esc(c.privacy[1])}</p></div>
    <div style="position:absolute;left:96px;top:380px">${column(c.reads, c.readList, 'reads')}</div>
    ${piece(s.ai, { left: 700, top: 360, width: 520 })}
    <div style="position:absolute;left:1304px;top:380px">${column(c.never, c.neverList, 'never')}</div>`);
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
      widgets: { devices: await shootPanel(locale, 'devices'), ai: await shootPanel(locale, 'ai') },
      groups: { group: await shootGroup(locale) },
      settings: { window: await shootSettings(locale, 'light', 'home') },
      dark: { window: await shootSettings(locale, 'dark', 'dock') },
    };
    for (const [name, pieces] of Object.entries(scenes)) {
      await render(compose(name, locale, pieces), resolve(out, `${name}-${locale}.jpg`));
    }
    // Explainers (not part of the release screenshot set).
    await render(anatomy(locale, { dockLight, notch: notchDark, panel: await shootPanel(locale, 'devices', 'light') }), resolve(out, `anatomy-${locale}.jpg`));
    await render(privacy(locale, { ai: await shootPanel(locale, 'ai', 'light') }), resolve(out, `privacy-${locale}.jpg`));
    console.log(`Rendered ${locale} stills`);
  }
} finally { await browser.close(); srv.close(); }
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
