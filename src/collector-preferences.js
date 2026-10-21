/* Shared by dock, Widgets and Plugins; imported values are normalized here. */
export const COLLECTOR_QUALITIES = ["best", "1080", "720"];
export function collectorPreferences(cfg = {}) {
  return {
    directory: typeof cfg.collectorDirectory === "string" ? cfg.collectorDirectory : "",
    format: cfg.collectorFormat === "audio" ? "audio" : "video",
    quality: COLLECTOR_QUALITIES.includes(cfg.collectorQuality) ? cfg.collectorQuality : "best",
  };
}
