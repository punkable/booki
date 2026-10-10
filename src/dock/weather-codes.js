/* WMO weather codes, as Open-Meteo reports them, folded into the few kinds the
   panel can draw and name. */

const KINDS = [
  [[0], "clear"],
  [[1, 2], "partly"],
  [[3], "cloudy"],
  [[45, 48], "fog"],
  [[51, 53, 55, 56, 57], "drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "rain"],
  [[71, 73, 75, 77, 85, 86], "snow"],
  [[95, 96, 99], "storm"],
];

const ICONS = {
  clear: "sun",
  partly: "cloud-sun",
  cloudy: "cloud",
  fog: "cloud-fog",
  drizzle: "cloud-drizzle",
  rain: "cloud-rain",
  snow: "cloud-snow",
  storm: "cloud-lightning",
};

/** Kind, icon name and i18n key for a weather code; unknown codes read as cloudy. */
export function weatherKind(code, isDay = 1) {
  const kind = KINDS.find(([codes]) => codes.includes(Number(code)))?.[1] || "cloudy";
  const icon = kind === "clear" && Number(isDay) === 0 ? "moon" : ICONS[kind];
  return { kind, icon, label: `weather.${kind}` };
}

/** Whole degrees in the chosen unit; Open-Meteo always answers in Celsius. */
export function formatDegrees(celsius, units) {
  if (!Number.isFinite(celsius)) return "—";
  return `${Math.round(units === "fahrenheit" ? celsius * 9 / 5 + 32 : celsius)}°`;
}

/* Open-Meteo times are the city's own wall clock with no offset, such as
   "2026-10-10T18:00". Formatting them as UTC keeps that wall clock instead of
   shifting it into the viewer's zone. */
function wallClock(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(text || ""));
  if (!match) return null;
  const [, y, m, d, h = "0", min = "0"] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)));
}

export function formatHour(text, lang) {
  const date = wallClock(text);
  return date ? date.toLocaleTimeString(lang, { hour: "numeric", timeZone: "UTC" }) : "";
}

export function formatWeekday(text, lang) {
  const date = wallClock(text);
  return date ? date.toLocaleDateString(lang, { weekday: "short", timeZone: "UTC" }) : "";
}
