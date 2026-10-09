/** The notch is a tab attached to the edge or a floating pill. Older
 *  configs ("smart", notchPeek) read as their closest shape. */
export function resolveNotchMode(cfg) {
  if (cfg?.notchMode === "floating") return "floating";
  if (cfg?.notchMode == null && cfg?.notchPeek === false) return "floating";
  return "attached";
}
