/* Slow native readings shared by the dock cards and their panels. */
import { dock as api } from "../api.js";
import { sharedReading } from "./async-cache.js";

export const deviceReading = sharedReading(() => api.deviceBatteries());
export const aiReading = sharedReading(() => api.aiUsage());

/* One meaning per color everywhere: good, fair, low, critical (blinks). */
export function batteryTone(level, charging = false) {
  if (charging) return "charging";
  return level <= 10 ? "critical" : level <= 20 ? "low" : level <= 50 ? "fair" : "good";
}
/* Usage runs the other way: the more of the limit is spent, the warmer. */
export function usageTone(percent) {
  return percent >= 95 ? "critical" : percent >= 80 ? "low" : percent >= 50 ? "fair" : "good";
}
export const TONE_COLORS = { good: "#30a46c", fair: "#f5a524", low: "#e5484d", critical: "#e5484d", charging: "#30a46c" };
