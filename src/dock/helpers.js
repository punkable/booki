/* Small helpers over the live config and pins: ids, lookups, names and icons. */

import { dock as dockApi, emitConfigChanged as emitConfigChangedRaw } from "../api.js";
import { isLibIcon, resolveLibIcon } from "../icon-library.js";
import { t } from "../i18n.js";
import { widgetDisplayName } from "../widgets-meta.js";
import { S } from "./state.js";

// The shared bridge filters this WebView's own echo by origin.
export function emitConfigChanged() { return emitConfigChangedRaw(); }
export const iconCache = new Map();
export const uid = () => Math.random().toString(36).slice(2, 9);
export const isVertical = () => S.cfg.edge === "left" || S.cfg.edge === "right";
export const baseSize = () => S.cfg.iconSize || 48;
export function findPinnedById(id, items = S.cfg?.pinned || []) {
  for (const item of items) {
    if (item.id === id) return item;
    const child = findPinnedById(id, item.children || []);
    if (child) return child;
  }
  return null;
}

export function widgetLabel(type) {
  return widgetDisplayName(type, t);
}

export function findWidgetPin(id, items = S.cfg.pinned) {
  for (const item of items) { if (item.id === id) return item; const child = item.children && findWidgetPin(id, item.children); if (child) return child; }
  return null;
}

// Pinned pictures show their own thumbnail instead of a generic file icon.
const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp|ico)$/i;

// The icon we can show RIGHT NOW without any async work (library glyph, custom
// override, or a cached extraction). null → it needs async extraction, so the
// caller shows a skeleton and fills in via resolveIcon().
export function syncIcon(item) {
  if (isLibIcon(item.icon)) return resolveLibIcon(item.icon);
  if (item.icon) return item.icon;
  if (iconCache.has(item.path)) return iconCache.get(item.path);
  return null;
}

export async function resolveIcon(item) {
  if (isLibIcon(item.icon)) return resolveLibIcon(item.icon); // built-in library glyph
  if (item.icon) return item.icon; // custom override (data URI or path-as-uri)
  if (iconCache.has(item.path)) return iconCache.get(item.path);
  let uri;
  try {
    uri = IMAGE_EXT.test(item.path || "")
      ? (await dockApi.imageDataUri(item.path)) || (await dockApi.appIcon(item.path))
      : await dockApi.appIcon(item.path);
  } catch (_) {
    uri = null;
  }
  // Only cache a real icon — never a failed/empty result, so a transient
  // extraction failure retries on the next render instead of sticking forever.
  if (uri) {
    iconCache.set(item.path, uri);
    while (iconCache.size > 256) iconCache.delete(iconCache.keys().next().value);
  }
  return uri;
}

export function baseName(path) {
  const file = String(path).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "App";
  return file.replace(/\.(exe|lnk|bat|cmd)$/i, "");
}

export function menuPinTitle(item) {
  if (!item) return "Booki";
  if (item.kind === "separator") return t("m.separator");
  if (item.kind === "trash") return t("trash.name");
  if (item.kind === "widget") return widgetLabel(item.widget);
  if (item.kind === "action" && item.name === "Booki") return t("m.settings");
  return item.name || baseName(item.path || "") || t("m.pin");
}
