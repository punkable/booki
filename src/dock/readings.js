/* Slow native readings shared by the dock cards and their panels. */
import { dock as api } from "../api.js";
import { sharedReading } from "./async-cache.js";

export const deviceReading = sharedReading(() => api.deviceBatteries());
export const aiReading = sharedReading(() => api.aiUsage());
export const statsReading = sharedReading(() => api.systemStats());
/** A provider has something current to show: plan windows (Codex) or an
 *  active 5-hour block (Claude). See ai_usage.rs. */
/** Token counts in a compact form: 820, 12 K, 1.2 M, 3.4 B. */
export function tokenText(n) {
  n = Math.max(0, Number(n) || 0);
  for (const [size, unit] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
    if (n >= size) { const v = n / size; return `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)} ${unit}`; }
  }
  return String(Math.round(n));
}

/* One meaning per color everywhere: good, fair, low, critical (blinks). */
export function batteryTone(level, charging = false) {
  if (charging) return "charging";
  return level <= 10 ? "critical" : level <= 20 ? "low" : level <= 50 ? "fair" : "good";
}
/* Usage runs the other way: the more of the limit is spent, the warmer. */
export function usageTone(percent) {
  return percent >= 95 ? "critical" : percent >= 80 ? "low" : percent >= 50 ? "fair" : "good";
}
export const TONE_COLORS = { good: "#30a46c", fair: "#f5a524", low: "#e5484d", critical: "#e5484d", charging: "#30a46c" };
export const updatesReading = sharedReading(() => api.appUpdates());
/** The updates still on offer: a dismissed one ("id@version") stays hidden
 *  until a newer version of that package appears. */
export function shownUpdates(list, ignored = []) {
  if (!Array.isArray(list)) return list;
  const skip = new Set(Array.isArray(ignored) ? ignored : []);
  return list.filter((u) => !skip.has(`${u.id}@${u.available}`));
}

// Brand words that say nothing on a small card: "SteelSeries Arctis Nova 7"
// reads as "Arctis Nova 7", "Logitech G502 X" as "G502 X".
const BRANDS = /^(logitech|logi|steelseries|razer|corsair|hyperx|sony|microsoft|apple|bose|jbl|samsung|sennheiser|jabra|asus|rog|msi|xbox|beats|anker|soundcore|keychron|nzxt|turtle beach)\s+/i;
/** A device's short name for its own card. */
export function shortDeviceName(name, max = 14) {
  const plain = String(name || "").replace(BRANDS, "").replace(/\s*\((?:bluetooth|wireless|usb)\)$/i, "").trim() || String(name || "");
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** The reading for a device's own card. Windows names one device a little
 *  differently per source (Bluetooth, Logitech, HeadsetControl), so after
 *  the exact name it tries the name without brand and punctuation, then
 *  either name containing the other, then the only device of the same kind. */
export function matchDevice(list, name, kind) {
  if (!Array.isArray(list) || !name) return null;
  const plain = (value) => shortDeviceName(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const want = plain(name);
  return list.find((d) => d.name === name)
    || list.find((d) => plain(d.name) === want)
    || list.find((d) => { const p = plain(d.name); return p && want && (p.includes(want) || want.includes(p)); })
    || (kind && kind !== "other" && list.filter((d) => d.kind === kind).length === 1 ? list.find((d) => d.kind === kind) : null)
    || null;
}
