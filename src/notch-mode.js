/** Notch shapes: a tab attached to the edge, a floating pill, or the smart
 *  circular dot that reacts to fullscreen apps and focus. */
export function resolveNotchMode(cfg) {
  if (["floating", "smart"].includes(cfg?.notchMode)) return cfg.notchMode;
  if (cfg?.notchMode == null && cfg?.notchPeek === false) return "floating";
  return "attached";
}
