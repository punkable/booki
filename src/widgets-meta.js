/* Shared widget catalog — dock + Settings must stay in sync. */

export const WIDGET_ORDER = [
  "clock", "cpu", "ram", "disk", "net", "uptime", "battery",
  "notes", "media", "volume", "clipboard",
];

/** Fluent emoji token per widget (see emoji.js / assets/emoji). */
export const WIDGET_ICONS = {
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

export const WIDGET_VARIANTS = ["glass", "solid", "gradient", "outline", "minimal"];

export const STAT_WIDGETS = ["cpu", "ram", "disk", "net", "uptime", "battery"];
export const RING_WIDGETS = ["cpu", "ram", "disk", "battery", "volume"];
export const PREVIEW_WIDGETS = ["notes", "clipboard"];

export const RING_DEFAULTS = {
  cpu: "#fb8b24",
  ram: "#3a86ff",
  disk: "#8338ec",
  battery: "#2ecc71",
  volume: "#06b6d4",
};

/** Settings store cards: emoji token, accent, i18n desc + capability chips. */
export const WIDGET_META = {
  clock: { emoji: "clock", accent: "#dfaa75", desc: "widget.clockDesc", caps: ["widget.cap.live", "widget.cap.clean"] },
  cpu: { emoji: "brain", accent: "#fb8b24", desc: "widget.cpuDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  ram: { emoji: "ice", accent: "#3a86ff", desc: "widget.ramDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  disk: { emoji: "floppy", accent: "#8338ec", desc: "widget.diskDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  net: { emoji: "antenna", accent: "#06b6d4", desc: "widget.netDesc", caps: ["widget.cap.live", "widget.cap.compact"] },
  uptime: { emoji: "stopwatch", accent: "#2bb673", desc: "widget.uptimeDesc", caps: ["widget.cap.live", "widget.cap.clean"] },
  battery: { emoji: "battery", accent: "#2ecc71", desc: "widget.batteryDesc", caps: ["widget.cap.live", "widget.cap.warning"] },
  notes: { emoji: "memo", accent: "#ffbe0b", desc: "widget.notesDesc", caps: ["widget.cap.editable", "widget.cap.preview"] },
  media: { emoji: "notes", accent: "#ff006e", desc: "widget.mediaDesc", caps: ["widget.cap.controls", "widget.cap.smart"] },
  volume: { emoji: "speaker", accent: "#06b6d4", desc: "widget.volumeDesc", caps: ["widget.cap.scroll", "widget.cap.ring"] },
  clipboard: { emoji: "clipboard", accent: "#7c3aed", desc: "widget.clipboardDesc", caps: ["widget.cap.private", "widget.cap.search"] },
};

/** Localized display name. Pass t() from i18n. */
export function widgetDisplayName(widget, t) {
  return (
    {
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
