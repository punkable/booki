/* Shared widget catalog — dock + Settings must stay in sync. */

export const WIDGET_ORDER = [
  "clock", "cpu", "ram", "disk", "net", "uptime", "battery",
  "notes", "media", "volume", "clipboard", "timer", "tasks", "calendar", "weather",
];

/** Fluent emoji token per widget (see emoji.js / assets/emoji). */
export const WIDGET_ICONS = {
  timer: "stopwatch", tasks: "memo", calendar: "clock", weather: "antenna",
  clock: "clock",
  cpu: "brain",
  ram: "ice",
  disk: "floppy",
  net: "antenna",
  uptime: "stopwatch",
  battery: "battery",
  notes: "memo",
  media: "notes",
  volume: "speaker",
  clipboard: "clipboard",
};

/** Line glyph (icons.js) for each widget: drawn in its dock cell (gauges draw
    a ring there instead) and in the add panel's gallery. The Fluent emoji
    above stay for the larger catalog surfaces in Settings. */
export const WIDGET_GLYPHS = {
  timer: "timer", tasks: "note", calendar: "clock", weather: "sparkles",
  clock: "clock",
  cpu: "cpu",
  ram: "memory",
  disk: "disk",
  battery: "battery",
  volume: "volume",
  net: "activity",
  uptime: "timer",
  notes: "note",
  media: "music",
  clipboard: "clipboard",
};

export const WIDGET_VARIANTS = ["glass", "solid", "gradient", "outline", "minimal"];

export const STAT_WIDGETS = ["cpu", "ram", "disk", "net", "uptime", "battery"];
export const RING_WIDGETS = ["cpu", "ram", "disk", "battery", "volume"];
export const PREVIEW_WIDGETS = ["notes", "clipboard"];

/** Gauge colours: the iOS system palette, vivid on a dark tile. */
export const RING_DEFAULTS = {
  cpu: "#0a84ff",
  ram: "#bf5af2",
  disk: "#ff9f0a",
  battery: "#30d158",
  volume: "#40c8e0",
};

/** Settings store cards: emoji token, accent, i18n desc + capability chips. */
export const WIDGET_META = {
  timer: { emoji: "stopwatch", accent: "#ff9f0a", desc: "widget.timerDesc", caps: ["widget.cap.controls", "widget.cap.private"] },
  tasks: { emoji: "memo", accent: "#30d158", desc: "widget.tasksDesc", caps: ["widget.cap.editable", "widget.cap.private"] },
  calendar: { emoji: "clock", accent: "#ff375f", desc: "widget.calendarDesc", caps: ["widget.cap.clean"] },
  weather: { emoji: "antenna", accent: "#40c8e0", desc: "widget.weatherDesc", caps: ["widget.cap.live"] },
  clock: { emoji: "clock", accent: "#ff9f0a", desc: "widget.clockDesc", caps: ["widget.cap.live", "widget.cap.clean"] },
  cpu: { emoji: "brain", accent: "#0a84ff", desc: "widget.cpuDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  ram: { emoji: "ice", accent: "#bf5af2", desc: "widget.ramDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  disk: { emoji: "floppy", accent: "#ff9f0a", desc: "widget.diskDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  net: { emoji: "antenna", accent: "#40c8e0", desc: "widget.netDesc", caps: ["widget.cap.live", "widget.cap.compact"] },
  uptime: { emoji: "stopwatch", accent: "#30d158", desc: "widget.uptimeDesc", caps: ["widget.cap.live", "widget.cap.clean"] },
  battery: { emoji: "battery", accent: "#30d158", desc: "widget.batteryDesc", caps: ["widget.cap.live", "widget.cap.warning"] },
  notes: { emoji: "memo", accent: "#ffd60a", desc: "widget.notesDesc", caps: ["widget.cap.editable", "widget.cap.preview"] },
  media: { emoji: "notes", accent: "#ff375f", desc: "widget.mediaDesc", caps: ["widget.cap.controls", "widget.cap.smart"] },
  volume: { emoji: "speaker", accent: "#40c8e0", desc: "widget.volumeDesc", caps: ["widget.cap.scroll", "widget.cap.ring"] },
  clipboard: { emoji: "clipboard", accent: "#bf5af2", desc: "widget.clipboardDesc", caps: ["widget.cap.private", "widget.cap.search"] },
};

/** Localized display name. Pass t() from i18n. */
export function widgetDisplayName(widget, t) {
  return (
    {
      timer: t("w.timer"), tasks: t("w.tasks"), calendar: t("w.calendar"), weather: t("w.weather"),
      clock: t("w.clock"),
      cpu: "CPU",
      ram: "RAM",
      disk: t("w.disk"),
      net: t("w.net"),
      uptime: t("w.uptime"),
      battery: t("w.battery"),
      notes: t("w.notes"),
      media: t("w.media"),
      volume: t("w.volume"),
      clipboard: t("w.clipboard"),
    }[widget] || widget
  );
}
