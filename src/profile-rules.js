/* Automatic profile switching. desiredProfile() is pure: given the rules,
   the time and how many displays are connected, it names the profile that
   should be active, or "" when the rules say nothing. The dock applies it
   only when that answer changes, so a profile picked by hand stays until
   the next change of schedule or monitors. */

export const DEFAULT_RULES = Object.freeze({
  enabled: false,
  monitorProfile: "",
  scheduleProfile: "",
  scheduleFrom: "09:00",
  scheduleTo: "18:00",
  scheduleDays: [1, 2, 3, 4, 5],
  otherProfile: "",
});

/** Rules with defaults filled in. Configs saved by Rust carry empty strings
 * and no days until a schedule is chosen, which used to blank the 09:00–18:00,
 * Monday–Friday defaults and make the schedule never match. */
export function withRuleDefaults(rules) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  if (!r.scheduleFrom) r.scheduleFrom = DEFAULT_RULES.scheduleFrom;
  if (!r.scheduleTo) r.scheduleTo = DEFAULT_RULES.scheduleTo;
  // Days stay empty only when the user cleared them for a chosen schedule.
  if (!r.scheduleProfile && !r.scheduleDays?.length) r.scheduleDays = [...DEFAULT_RULES.scheduleDays];
  return r;
}

/** Minutes after midnight for "HH:MM", or null. */
export function parseClock(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || "").trim());
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** Whether `now` falls in the schedule. A range that ends before it starts
    (22:00 to 06:00) runs overnight, and counts for the day it started. */
export function inSchedule(rules, now) {
  const from = parseClock(rules.scheduleFrom), to = parseClock(rules.scheduleTo);
  if (from == null || to == null || from === to) return false;
  const days = Array.isArray(rules.scheduleDays) ? rules.scheduleDays : [];
  const minute = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  if (from < to) return days.includes(today) && minute >= from && minute < to;
  if (minute >= from) return days.includes(today);
  return minute < to && days.includes((today + 6) % 7);
}

/** The profile the rules want now: an external monitor first, then the
    schedule, then the fallback. Only names in `available` count. */
export function desiredProfile(rules, { now = new Date(), monitors = 1, available = [] } = {}) {
  const r = withRuleDefaults(rules);
  if (!r.enabled) return "";
  const known = (name) => !!name && available.includes(name);
  if (monitors >= 2 && known(r.monitorProfile)) return r.monitorProfile;
  if (known(r.scheduleProfile) && inSchedule(r, now)) return r.scheduleProfile;
  return known(r.otherProfile) ? r.otherProfile : "";
}
