/* Explicit capabilities: a plugin's feed label is not its dock widget. */
export const PLUGIN_WIDGETS = {
  headsetcontrol: ["devices"],
  librehardwaremonitor: ["system"],
  "yt-dlp": ["collector"],
  ffmpeg: ["collector"],
  "gallery-dl": ["collector"],
  openrgb: ["lighting"],
  winget: ["updates"],
};
export const pluginsForWidget = (widget) => Object.keys(PLUGIN_WIDGETS).filter((id) => PLUGIN_WIDGETS[id].includes(widget));
export function pinnedWidgetInstances(pins = [], widget, group = "") {
  return pins.flatMap((pin) => pin.kind === "widget" && pin.widget === widget ? [{ ...pin, group }]
    : pin.kind === "group" ? pinnedWidgetInstances(pin.children || [], widget, pin.name || group) : []);
}
