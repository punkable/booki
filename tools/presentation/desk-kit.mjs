/* Shared pieces for the realistic captures (desktop.mjs, clips.mjs): photo
   wallpapers from Unsplash (Unsplash License, cached in the ignored
   public/stills/) and brand app icons from Simple Icons (CC0 data; the marks
   remain their owners' trademarks). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as si from 'simple-icons';

const here = dirname(fileURLToPath(import.meta.url));
const cache = resolve(here, 'public/stills'); mkdirSync(cache, { recursive: true });

export const WALLS = {
  valley: '1506744038136-46273834b3fb', // misty valley at dawn
  peaks: '1477346611705-65d1883cee1e', // red peaks at dusk
  lake: '1501785888041-af3ef285b470', // mountain lake
};
export async function wallpaper(key) {
  const file = resolve(cache, `wall-${key}.jpg`);
  if (!existsSync(file)) {
    const res = await fetch(`https://images.unsplash.com/photo-${WALLS[key]}?w=2560&q=82&fm=jpg`);
    if (!res.ok) throw new Error(`wallpaper ${key}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
}

/* App icon: the brand mark in white on a squircle of the brand colour. */
export function brandIcon(icon, bg) {
  const hex = bg || `#${icon.hex}`;
  const dark = parseInt(hex.slice(1), 16) < 0x202020;
  const fill = dark ? '#232327' : hex;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect x="4" y="4" width="88" height="88" rx="22" fill="${fill}"/><rect x="4" y="4" width="88" height="88" rx="22" fill="url(#s)"/><g transform="translate(24 24) scale(2)" fill="#fff"><path d="${icon.path}"/></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
export const APPS = {
  chrome: ['Google Chrome', si.siGooglechrome], spotify: ['Spotify', si.siSpotify], discord: ['Discord', si.siDiscord],
  figma: ['Figma', si.siFigma], notion: ['Notion', si.siNotion], obsidian: ['Obsidian', si.siObsidian],
  github: ['GitHub Desktop', si.siGithub], steam: ['Steam', si.siSteam], blender: ['Blender', si.siBlender],
  whatsapp: ['WhatsApp', si.siWhatsapp], telegram: ['Telegram', si.siTelegram], vlc: ['VLC', si.siVlcmediaplayer],
  code: ['VSCodium', si.siVscodium], claude: ['Claude', si.siClaude],
};
export const pathOf = (key) => `C:/Program Files/${APPS[key][0].replace(/ /g, '')}/${key}.exe`;
export const icons = Object.fromEntries(Object.keys(APPS).map((k) => [pathOf(k), brandIcon(APPS[k][1])]));
export const app = (key, style) => ({ id: `app-${key}`, kind: 'app', name: APPS[key][0], path: pathOf(key), ...(style ? { style } : {}) });

/** A drawn pointer that follows the mouse: recorded video has no cursor. */
export const CURSOR = '<svg width="26" height="34" viewBox="0 0 13 17"><path d="M1 1v14l3.6-3.4 2.4 5 2.2-1-2.4-4.9H12Z" fill="#000" stroke="#fff" stroke-width="1"/></svg>';
