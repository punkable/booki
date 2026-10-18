/* Shared widget catalog: the dock, the add panel and Settings read it.

   Thirteen widgets. CPU, RAM, disk and network live in one "system" widget that
   shows the metrics you choose; timer and tasks live in "focus". Configs from
   older builds are migrated by the backend (config rev 9); canonicalWidget()
   lets previews of old profiles and backups render before that happens. */

export const WIDGET_ORDER = [
  "clock", "calendar", "weather", "system", "battery", "devices",
  "ai", "media", "volume", "notes", "clipboard", "focus", "collector",
];

/** Old widget names → the widget that replaced them (null = retired). */
const LEGACY_WIDGETS = { cpu: "system", ram: "system", disk: "system", net: "system", timer: "focus", tasks: "focus", uptime: null };
export function canonicalWidget(widget) {
  return widget in LEGACY_WIDGETS ? LEGACY_WIDGETS[widget] : widget;
}

/** Metrics the system widget can show, in display order. */
export const SYSTEM_METRICS = ["cpu", "ram", "disk", "net"];
export function systemMetrics(style) {
  const chosen = Array.isArray(style?.metrics) ? style.metrics : ["cpu", "ram"];
  const list = SYSTEM_METRICS.filter((metric) => chosen.includes(metric));
  return list.length ? list : ["cpu"];
}

/** Fluent emoji token per widget (see emoji.js / assets/emoji). */
export const WIDGET_ICONS = {
  clock: "clock", calendar: "clock", weather: "antenna", system: "brain",
  battery: "battery", devices: "battery", ai: "sparkles", media: "notes", volume: "speaker", notes: "memo",
  clipboard: "clipboard", focus: "stopwatch", collector: "folder",
};

/** Line glyph (icons.js) drawn in the dock cell and the add panel. */
export const WIDGET_GLYPHS = {
  clock: "clock", calendar: "calendar", weather: "cloud-sun", system: "cpu",
  battery: "battery", devices: "battery", ai: "sparkles", media: "music", volume: "volume", notes: "note",
  clipboard: "clipboard", focus: "timer", collector: "download",
  // Metric glyphs inside the system widget.
  cpu: "cpu", ram: "memory", disk: "disk", net: "activity",
};

export const WIDGET_VARIANTS = ["glass", "solid", "minimal"];

export const STAT_WIDGETS = ["system", "battery"];
export const RING_WIDGETS = ["battery", "devices", "ai", "volume", "collector"];
export const PREVIEW_WIDGETS = ["notes", "clipboard"];

/** Gauge colours: the iOS system palette, vivid on any plate. */
export const RING_DEFAULTS = {
  cpu: "#0078d4",
  ram: "#8764b8",
  disk: "#f7630c",
  net: "#00b7c3",
  battery: "#13a10e",
  devices: "#0078d4",
  ai: "#8764b8",
  volume: "#00b7c3",
  collector: "#0f6cbd",
};

/** Catalog cards in Settings: accent and description key. */
export const WIDGET_META = {
  clock: { accent: "#f7630c", desc: "widget.clockDesc", category: "time" },
  calendar: { accent: "#e3008c", desc: "widget.calendarDesc", category: "time" },
  weather: { accent: "#00b7c3", desc: "widget.weatherDesc", category: "time" },
  system: { accent: "#0078d4", desc: "widget.systemDesc", category: "system" },
  battery: { accent: "#13a10e", desc: "widget.batteryDesc", category: "system" },
  devices: { accent: "#0078d4", desc: "widget.devicesDesc", category: "system" },
  ai: { accent: "#8764b8", desc: "widget.aiDesc", category: "tools" },
  media: { accent: "#e3008c", desc: "widget.mediaDesc", category: "media" },
  volume: { accent: "#00b7c3", desc: "widget.volumeDesc", category: "media" },
  notes: { accent: "#ffb900", desc: "widget.notesDesc", category: "tools" },
  clipboard: { accent: "#8764b8", desc: "widget.clipboardDesc", category: "tools" },
  focus: { accent: "#f7630c", desc: "widget.focusDesc", category: "tools" },
  collector: { accent: "#0f6cbd", desc: "widget.collectorDesc", category: "tools", plugin: "yt-dlp" },
};

/** Localized display name. Pass t() from i18n. */
export function widgetDisplayName(widget, t) {
  const name = canonicalWidget(widget);
  return name ? t(`w.${name}`) : widget;
}

/** Short metric label inside the system widget. */
export function metricLabel(metric, t) {
  return metric === "cpu" ? "CPU" : metric === "ram" ? "RAM" : t(`w.${metric}`);
}
