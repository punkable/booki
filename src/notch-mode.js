/** Normalize notch mode from config (including legacy peek / multi-notch keys). */
export function resolveNotchMode(cfg) {
  if (!cfg) return "attached";
  if (cfg.notchMode === "attached" || cfg.notchMode === "floating" || cfg.notchMode === "smart") {
    return cfg.notchMode;
  }
  if (cfg.notchPeek === false) return "floating";
  if (cfg.multiNotchEnabled) return "smart";
  return "attached";
}
