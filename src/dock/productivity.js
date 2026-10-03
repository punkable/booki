/* Local productivity state. Timers use a deadline, so hiding the dock,
   suspension, and app restarts never slow down the countdown. */
export function timerSeconds(style = {}, now = Date.now()) {
  const duration = Math.min(180, Math.max(1, Number(style.minutes) || 25)) * 60;
  return style.endsAt ? Math.max(0, Math.ceil((Number(style.endsAt) - now) / 1000)) : Math.max(0, style.remaining == null ? duration : Number(style.remaining) || 0);
}
export function toggleTimer(style = {}, now = Date.now()) {
  if (style.endsAt) return { ...style, remaining: Math.max(0, Math.ceil((style.endsAt - now) / 1000)), endsAt: null };
  const seconds = timerSeconds(style, now);
  return { ...style, remaining: null, endsAt: now + (seconds || (Number(style.minutes) || 25) * 60) * 1000 };
}
export function formatTimer(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
export function calendarMonth(date) {
  const year = date.getFullYear(), month = date.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i < offset || i >= offset + days ? null : i - offset + 1);
}
export function tasksSummary(tasks = []) {
  const list = Array.isArray(tasks) ? tasks : [];
  return { total: list.length, done: list.filter((task) => task.done).length, next: list.find((task) => !task.done)?.text || "" };
}
