/* Automatic profiles: pick which saved profile Booki switches to with an
   external monitor, during a schedule and the rest of the time. The dock
   does the switching (src/profile-rules.js). */
import React, { useEffect, useState } from "react";
import { dock as dockApi } from "../api.js";
import { curLang, t } from "../i18n.js";
import { DEFAULT_RULES } from "../profile-rules.js";
import { Row, Select, SettingsSection, Toggle } from "./ui.jsx";

// Monday first; values follow Date#getDay (0 = Sunday).
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const dayName = (day) => new Intl.DateTimeFormat(curLang(), { weekday: "short" }).format(new Date(2026, 9, 11 + day));

export function AutoProfiles({ cfg, set }) {
  const rules = { ...DEFAULT_RULES, ...(cfg.profileRules || {}) };
  const [profiles, setProfiles] = useState(null);
  // The list is only needed once the rules are on.
  useEffect(() => {
    if (!rules.enabled) return undefined;
    let alive = true;
    dockApi.profileList().then((list) => { if (alive) setProfiles(list || []); }, () => { if (alive) setProfiles([]); });
    return () => { alive = false; };
  }, [rules.enabled, cfg.lastProfile]);
  const update = (patch) => set({ profileRules: { ...rules, ...patch } });
  const options = [{ value: "", label: t("autoProf.none") }, ...(profiles || []).map((name) => ({ value: name, label: name }))];
  // A profile that was deleted still shows, so the choice is never silently lost.
  const withCurrent = (value) => value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  const days = rules.scheduleDays || [];
  const toggleDay = (day) => update({ scheduleDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort() });

  return <SettingsSection icon="clock" title={t("autoProf.title")} hint={rules.enabled ? t("autoProf.manualHint") : null}>
    <Toggle label={t("autoProf.toggle")} hint={rules.enabled && profiles && !profiles.length ? t("autoProf.needProfiles") : t("autoProf.hint")} checked={rules.enabled} onChange={(v) => update({ enabled: v })} />
    {rules.enabled && !!profiles?.length && <>
      <Row label={t("autoProf.monitor")} hint={t("autoProf.monitorHint")}>
        <Select label={t("autoProf.monitor")} value={rules.monitorProfile} options={withCurrent(rules.monitorProfile)} onChange={(v) => update({ monitorProfile: v })} />
      </Row>
      <Row label={t("autoProf.schedule")} hint={t("autoProf.scheduleHint")}>
        <Select label={t("autoProf.schedule")} value={rules.scheduleProfile} options={withCurrent(rules.scheduleProfile)} onChange={(v) => update({ scheduleProfile: v })} />
      </Row>
      {rules.scheduleProfile && <Row label={t("autoProf.hours")} stack>
        <div className="auto-prof-hours">
          <label>{t("autoProf.from")} <input type="time" className="text-field" value={rules.scheduleFrom} onChange={(e) => e.target.value && update({ scheduleFrom: e.target.value })} /></label>
          <label>{t("autoProf.to")} <input type="time" className="text-field" value={rules.scheduleTo} onChange={(e) => e.target.value && update({ scheduleTo: e.target.value })} /></label>
          <div className="chips" role="group" aria-label={t("autoProf.days")}>
            {WEEK.map((day) => <button key={day} type="button" className="chip" aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>{dayName(day)}</button>)}
          </div>
        </div>
      </Row>}
      <Row label={t("autoProf.other")} hint={t("autoProf.otherHint")}>
        <Select label={t("autoProf.other")} value={rules.otherProfile} options={withCurrent(rules.otherProfile)} onChange={(v) => update({ otherProfile: v })} />
      </Row>
    </>}
  </SettingsSection>;
}
