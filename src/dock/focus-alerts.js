/* A Windows notification when a focus timer ends. Timers are scheduled from
   each pin's `endsAt`, so the alert fires on time even while the dock is
   tucked away and its polls are stopped. */
import { dock as dockApi } from "../api.js";
import { t } from "../i18n.js";
import { tasksSummary } from "./productivity.js";
import { syncFocusDnd } from "./focus-dnd.js";

const pending = new Map(); // pin id → { endsAt, timer }
// setTimeout clamps longer delays to ~1 ms; focus timers never run this long.
const MAX_DELAY = 2 ** 31 - 1;

function focusPins(items = [], out = []) {
  for (const item of items) {
    if (item.kind === "widget" && item.widget === "focus") out.push(item);
    if (item.children) focusPins(item.children, out);
  }
  return out;
}

function alert(item) {
  const next = tasksSummary(item.style?.tasks).next;
  const body = next ? t("notch.nextTask").replace("{task}", () => next) : t("notch.takeBreak");
  // Hand Do not disturb back first, or Windows would hold this very toast.
  syncFocusDnd().finally(() => dockApi.notify(t("focus.finished"), body).catch(() => {}));
}

/** Re-sync the scheduled alerts with the pinned focus timers. */
export function scheduleFocusAlerts(pinned) {
  syncFocusDnd(pinned);
  const now = Date.now();
  const live = new Set();
  for (const item of focusPins(pinned)) {
    const endsAt = Number(item.style?.endsAt) || 0;
    if (!endsAt || endsAt <= now || endsAt - now > MAX_DELAY) continue;
    live.add(item.id);
    if (pending.get(item.id)?.endsAt === endsAt) continue;
    clearTimeout(pending.get(item.id)?.timer);
    const timer = setTimeout(() => { pending.delete(item.id); alert(item); }, endsAt - now);
    pending.set(item.id, { endsAt, timer });
  }
  // Paused, reset, removed or finished timers drop their alert.
  for (const [id, entry] of pending) {
    if (!live.has(id)) { clearTimeout(entry.timer); pending.delete(id); }
  }
}
