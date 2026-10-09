/* Shared widget catalog: the dock, the add panel and Settings read it.

   Ten widgets. CPU, RAM, disk and network live in one "system" widget that
   shows the metrics you choose; timer and tasks live in "focus". Configs from
   older builds are migrated by the backend (config rev 9); canonicalWidget()
   lets previews of old profiles and backups render before that happens. */

export const WIDGET_ORDER = [
  "clock", "calendar", "weather", "system", "battery",
  "media", "volume", "notes", "clipboard", "focus",
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
  battery: "battery", media: "notes", volume: "speaker", notes: "memo",
  clipboard: "clipboard", focus: "stopwatch",
};

/** Line glyph (icons.js) drawn in the dock cell and the add panel. */
export const WIDGET_GLYPHS = {
  clock: "clock", calendar: "clock", weather: "sparkles", system: "cpu",
  battery: "battery", media: "music", volume: "volume", notes: "note",
  clipboard: "clipboard", focus: "timer",
  // Metric glyphs inside the system widget.
  cpu: "cpu", ram: "memory", disk: "disk", net: "activity",
};

export const WIDGET_VARIANTS = ["glass", "solid", "minimal"];

export const STAT_WIDGETS = ["system", "battery"];
export const RING_WIDGETS = ["battery", "volume"];
export const PREVIEW_WIDGETS = ["notes", "clipboard"];

/** Gauge colours: the iOS system palette, vivid on any plate. */
export const RING_DEFAULTS = {
  cpu: "#0a84ff",
  ram: "#bf5af2",
  disk: "#ff9f0a",
  net: "#40c8e0",
  battery: "#30d158",
  volume: "#40c8e0",
};

/** Catalog cards in Settings: accent and description key. */
export const WIDGET_META = {
  clock: { accent: "#ff9f0a", desc: "widget.clockDesc", category: "time" },
  calendar: { accent: "#ff375f", desc: "widget.calendarDesc", category: "time" },
  weather: { accent: "#40c8e0", desc: "widget.weatherDesc", category: "time" },
  system: { accent: "#0a84ff", desc: "widget.systemDesc", category: "system" },
  battery: { accent: "#30d158", desc: "widget.batteryDesc", category: "system" },
  media: { accent: "#ff375f", desc: "widget.mediaDesc", category: "media" },
  volume: { accent: "#40c8e0", desc: "widget.volumeDesc", category: "media" },
  notes: { accent: "#ffd60a", desc: "widget.notesDesc", category: "tools" },
  clipboard: { accent: "#bf5af2", desc: "widget.clipboardDesc", category: "tools" },
  focus: { accent: "#ff9f0a", desc: "widget.focusDesc", category: "tools" },
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
