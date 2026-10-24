/* Diagnostics: when this window's main thread is blocked for longer than
   200 ms (a scroll that freezes, a click that waits), write how long and
   where to Booki's log, at most once every few seconds. Nothing leaves the PC. */
import { logMessage } from "./api.js";

export function watchLongTasks(where) {
  if (typeof PerformanceObserver !== "function" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
  let last = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration < 200 || performance.now() - last < 5000) continue;
      last = performance.now();
      const page = document.querySelector("[aria-current='page']")?.textContent?.trim() || "";
      logMessage("warn", `long task ${Math.round(entry.duration)} ms in ${where}${page ? ` (${page})` : ""}`);
    }
  }).observe({ type: "longtask", buffered: false });
}
