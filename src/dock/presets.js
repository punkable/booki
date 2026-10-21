/* Explicit, optional presets. No pins, monitor, profiles or global theme are
   replaced. Advanced controls remain available after choosing one. */
export const DOCK_PRESETS = [
  { id: "balanced", patch: { notchMode: "smart", surfaceStyle: "taskbar", magnification: false, overflowMode: "scroll", spacing: 6, cornerRadius: 12 } },
  { id: "quiet", patch: { notchMode: "smart", surfaceStyle: "solid", magnification: false, overflowMode: "scroll", spacing: 4, cornerRadius: 8 } },
  { id: "expressive", patch: { notchMode: "smart", surfaceStyle: "glass", magnification: true, magnifyStyle: "smooth", zoom: 1.2, overflowMode: "scroll", spacing: 8, cornerRadius: 12 } },
];
