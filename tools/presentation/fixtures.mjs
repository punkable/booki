import { readFileSync } from 'node:fs';
globalThis.__readFile = readFileSync;
/* Safe, made-up sample data for the presentation captures. No real user data,
   no third-party logos: app icons are generic glyphs on coloured squircles. */
const glyphs = {
  browser: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/>',
  mail: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="m4 8 8 5 8-5"/>',
  music: '<path d="M9 17V6l10-2v11"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',
  photos: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9.5" cy="9.5" r="1.8"/><path d="m20 15-4.5-4.5L6 20"/>',
  notes: '<path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  files: '<path d="M4 18V7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>',
  editor: '<path d="m15.5 17 5-5-5-5M8.5 7l-5 5 5 5"/>',
  terminal: '<path d="m5 16 5-4-5-4"/><path d="M12.5 17h6.5"/>',
  chat: '<path d="M20 14a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/>',
  camera: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  videos: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
};
const palette = {
  browser: ['#4facfe', '#0a6cf0'], mail: ['#5ac8fa', '#1a7cf5'], music: ['#ff6b8b', '#f2264d'],
  photos: ['#ffd36b', '#ff8a3d'], notes: ['#ffe27a', '#f7b500'], files: ['#7cc4ff', '#3d8bfd'],
  editor: ['#7b6cff', '#4a3ad8'], terminal: ['#3a3a40', '#141416'], chat: ['#5ee28a', '#1fb257'],
  camera: ['#9aa3ad', '#5b636d'], calendar: ['#ff8a80', '#e8453c'], videos: ['#c084fc', '#8b3fe0'],
  settings: ['#a7adb5', '#6b727b'],
};
export function iconUri(key) {
  const [a, b] = palette[key]; const g = glyphs[key];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect x="4" y="4" width="88" height="88" rx="22" fill="url(#g)"/><rect x="4" y="4" width="88" height="88" rx="22" fill="url(#s)"/><g transform="translate(18 18) scale(2.5)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${g}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
export const APP_NAMES = { browser: 'Browser', mail: 'Mail', music: 'Music', photos: 'Photos', notes: 'Notes', files: 'Files', editor: 'Code Editor', terminal: 'Terminal', chat: 'Chat', camera: 'Camera', calendar: 'Calendar', videos: 'Videos', settings: 'Settings' };
export const appPath = (key) => `C:/Examples/${APP_NAMES[key].replace(/ /g, '')}.exe`;
export const app = (key) => ({ id: `app-${key}`, name: APP_NAMES[key], kind: 'app', path: appPath(key) });
export const widget = (name, style = {}) => ({ id: `w-${name}`, kind: 'widget', widget: name, style });
export const tasks = (locale) => (locale === 'es'
  ? ['Revisar el diseño', 'Enviar la propuesta', 'Llamar a Ana', 'Preparar la demo', 'Comprar café']
  : ['Review the design', 'Send the proposal', 'Call Ana', 'Prepare the demo', 'Buy coffee'])
  .map((text, i) => ({ id: `t${i}`, text, done: i < 2 }));
export const city = (locale) => ({ city: locale === 'es' ? 'Ciudad de México' : 'Lisbon', latitude: 38.72, longitude: -9.14 });
/* JSON that is safe to splice into a script: no tag, line-separator or
   backslash-quote surprises. */
const ESCAPES = { '<': '\\u003c', '>': '\\u003e', '/': '\\u002f', '\u2028': '\\u2028', '\u2029': '\\u2029' };
const literal = (value) => JSON.stringify(value).replace(/[<>/\u2028\u2029]/g, (c) => ESCAPES[c]);
/* Patch the fake backend with richer sample answers. Runs in the page. */
export function bridgePatch(icons) {
  return `(() => { const old = window.__TAURI__.core.invoke; const icons = ${literal(icons)};
    window.__TAURI__.core.invoke = (cmd, args = {}) => {
      if (cmd === 'app_icon' || cmd === 'image_data_uri') return Promise.resolve(icons[args.path] || '');
      if (cmd === 'media_info') return Promise.resolve({ title: 'Golden Hour', artist: 'Sample Artist', album: 'Example', playing: true });
      if (cmd === 'weather_current') return Promise.resolve({ temperature_2m: 22.4, weather_code: 1 });
      if (cmd === 'running_windows' || cmd === 'list_windows') return Promise.resolve([{ hwnd: 1, title: 'Browser', exe: 'C:/Examples/Browser.exe', path: 'C:/Examples/Browser.exe' }, { hwnd: 2, title: 'Music', exe: 'C:/Examples/Music.exe', path: 'C:/Examples/Music.exe' }]);
      return old(cmd, args);
    }; })();`;
}
export const allIcons = () => Object.fromEntries(Object.keys(APP_NAMES).map((k) => [appPath(k), iconUri(k)]));
/* Windows draws Booki in Segoe UI, which a Linux capture machine lacks; the
   fallback is much wider and truncates labels. Inter is the closest open face.
   The clock starts at `clock` and runs on, which the film needs; `frozen`
   stops it there, so every still reads the same minute. */
export function studioPatch(fontPath, { clock = '2026-10-06T09:41:00', frozen = false } = {}) {
  const font = (globalThis.__bookiFont ||= Buffer.from(globalThis.__readFile(fontPath)).toString('base64'));
  return `(() => {
    const start = new Date(${literal(clock)}).getTime(), real = Date.now(), Real = Date;
    const now = ${frozen ? '() => start' : '() => start + (Real.now() - real)'};
    class Fixed extends Real { constructor(...a) { super(...(a.length ? a : [now()])); } static now() { return now(); } }
    window.Date = Fixed;
    const css = "@font-face{font-family:BookiStudio;src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:100 900}:root{--font:BookiStudio,sans-serif!important;--font-display:BookiStudio,sans-serif!important}body{font-feature-settings:'cv11','ss01'}";
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  })();`;
}
