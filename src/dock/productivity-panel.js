import { t, curLang } from "../i18n.js";
import { calendarMonth, calendarWeekStart, toggleTimer, timerSeconds, formatTimer } from "./productivity.js";
import { dock as dockApi } from "../api.js";
import { icon } from "../icons.js";
import { weatherKind, formatDegrees, formatHour, formatWeekday } from "./weather-codes.js";

// One forecast per city for ten minutes, however often the panel is reopened.
const forecastCache = new Map();
function loadForecast(request, latitude, longitude) {
  const key = `${latitude},${longitude}`;
  const hit = forecastCache.get(key);
  if (hit && Date.now() < hit.expires) return hit.promise;
  const entry = { promise: Promise.resolve().then(() => request(latitude, longitude)), expires: Date.now() + 600000 };
  forecastCache.set(key, entry);
  entry.promise.catch(() => { if (forecastCache.get(key) === entry) forecastCache.delete(key); });
  return entry.promise;
}

/* Build with textContent: task text and remote city names never become HTML. */
export function buildProductivityPanel(item, { save, weatherSearch, weatherForecast = dockApi.weatherForecast, close }) {
  const panel = document.createElement("div");
  panel.className = "productivity-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", t(`w.${item.widget}`));
  const head = document.createElement("div"); head.className = "productivity-head";
  const title = document.createElement("strong"); title.textContent = t(`w.${item.widget}`); head.appendChild(title);
  const button = (label, fn, container = panel) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label;
    b.className = "productivity-button"; b.addEventListener("click", fn); container.appendChild(b); return b;
  };
  button(t("stack.close"), close, head); panel.appendChild(head);
  const body = document.createElement("div"); panel.appendChild(body);
  let timer = null;
  let monthOffset = 0;
  let queue = Promise.resolve();
  let disposed = false;
  panel.dispose = () => { disposed = true; clearInterval(timer); };
  const update = (patch) => {
    queue = queue.then(async () => {
      const old = item.style;
      item.style = { ...(old || {}), ...(typeof patch === "function" ? patch(old || {}) : patch) };
      body.querySelector(".productivity-save-error")?.remove();
      try { await save(item, old); if (!disposed) draw(); }
      catch (failure) {
        item.style = old;
        if (disposed) return;
        const error = document.createElement("div"); error.className = "productivity-save-error"; error.setAttribute("role", "alert");
        const unavailable = failure?.code === "WIDGET_UNAVAILABLE";
        const message = document.createElement("p"); message.textContent = t(unavailable ? "focus.widgetUnavailable" : "overhaul.failed"); error.append(message);
        if (!unavailable) button(t("focus.retry"), () => update(patch), error);
        body.appendChild(error);
      }
    });
    return queue;
  };
  const SECTIONS = { timer: ["timer"], tasks: ["tasks"], focus: ["timer", "tasks"], calendar: ["calendar"], clock: ["calendar"], weather: ["weather"] };
  function draw() {
    if (disposed) return;
    clearInterval(timer);
    body.replaceChildren();
    const st = item.style || {};
    for (const name of SECTIONS[item.widget] || []) {
      const section = document.createElement("section"); section.className = `productivity-section productivity-${name}`;
      body.appendChild(section);
      DRAW[name](section, st);
    }
  }
  const DRAW = {
    timer(body, st) {
      const value = document.createElement("div"); value.className = "focus-countdown";
      value.setAttribute("role", "timer");
      value.textContent = formatTimer(timerSeconds(st)); body.appendChild(value);
      if (st.endsAt && timerSeconds(st) > 0) timer = setInterval(() => { if (!panel.isConnected) { clearInterval(timer); return; } value.textContent = formatTimer(timerSeconds(st)); if (timerSeconds(st) === 0) draw(); }, 1000);
      const row = document.createElement("div"); row.className = "focus-actions"; body.appendChild(row);
      button(t(st.endsAt && timerSeconds(st) > 0 ? "focus.pause" : "focus.start"), () => update((current) => toggleTimer(current)), row);
      button(t("focus.reset"), () => update({ endsAt: null, remaining: null }), row);
      const label = document.createElement("label"); label.textContent = t("focus.duration");
      const input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = "180"; input.value = String(st.minutes || 25);
      input.addEventListener("change", () => update({ minutes: Math.max(1, Math.min(180, Number(input.value) || 25)), endsAt: null, remaining: null }));
      label.appendChild(input); body.appendChild(label);
    },
    tasks(body, st) {
      const list = Array.isArray(st.tasks) ? st.tasks : [];
      for (const task of list) {
        const row = document.createElement("div"); row.className = "focus-task";
        const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = !!task.done;
        checkbox.setAttribute("aria-label", task.text);
        checkbox.addEventListener("change", () => { const done = checkbox.checked; update((current) => ({ tasks: (current.tasks || []).map((entry) => entry.id === task.id ? { ...entry, done } : entry) })); });
        const text = document.createElement("button"); text.type = "button"; text.className = "task-edit"; text.textContent = task.text; text.setAttribute("aria-label", `${t("apps.rename")}: ${task.text}`);
        text.addEventListener("click", (event) => { event.preventDefault(); const input = document.createElement("input"); input.value = task.text; input.maxLength = 200; input.setAttribute("aria-label", t("apps.rename")); text.replaceWith(input); input.focus(); let done = false; const commit = () => { if (done) return; done = true; if (!input.value.trim()) return draw(); update((current) => ({ tasks: (current.tasks || []).map((entry) => entry.id === task.id ? { ...entry, text: input.value.trim() } : entry) })); }; input.addEventListener("blur", commit); input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { done = true; draw(); } }); }); label.append(checkbox, text); row.appendChild(label);
        const remove = button("×", () => update((current) => ({ tasks: (current.tasks || []).filter((entry) => entry.id !== task.id) })), row); remove.setAttribute("aria-label", t("apps.remove")); body.appendChild(row);
      }
      const form = document.createElement("form"); form.className = "focus-actions";
      const input = document.createElement("input"); input.className = "focus-new-task"; input.placeholder = t("focus.newTask"); input.setAttribute("aria-label", t("focus.newTask")); input.maxLength = 200; form.appendChild(input);
      const add = button("+", () => {}, form); add.type = "submit"; add.setAttribute("aria-label", t("focus.newTask"));
      form.addEventListener("submit", (event) => {
        event.preventDefault(); const text = input.value.trim();
        if (!text || input.disabled || list.length >= 100) return;
        input.disabled = true; add.disabled = true;
        update((current) => ({ tasks: [...(current.tasks || []), { id: crypto.randomUUID(), text, done: false }] })).finally(() => {
          input.disabled = false; add.disabled = false;
          if (panel.isConnected) panel.querySelector(".focus-new-task")?.focus();
        });
      }); body.appendChild(form);
    },
    calendar(body) {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const nav = document.createElement("div"); nav.className = "focus-actions"; body.appendChild(nav);
      button(t("premium.previousMonth"), () => { monthOffset--; draw(); }, nav);
      button(t("focus.today"), () => { monthOffset = 0; draw(); }, nav);
      button(t("premium.nextMonth"), () => { monthOffset++; draw(); }, nav);
      const label = document.createElement("p"); label.textContent = date.toLocaleDateString(curLang(), { month: "long", year: "numeric" }); label.setAttribute("aria-live", "polite"); body.appendChild(label);
      const grid = document.createElement("div"); grid.className = "focus-calendar";
      const weekStart = calendarWeekStart(navigator.language || curLang());
      for (let i = 0; i < 7; i++) { const cell = document.createElement("strong"); cell.textContent = new Date(2024, 0, 7 + weekStart + i).toLocaleDateString(curLang(), { weekday: "short" }); grid.appendChild(cell); }
      for (const day of calendarMonth(date, weekStart)) { const cell = document.createElement("span"); cell.textContent = day ? String(day) : ""; if (monthOffset === 0 && day === now.getDate()) { cell.className = "today"; cell.setAttribute("aria-label", t("focus.today")); } grid.appendChild(cell); } body.appendChild(grid);
    },
    weather(body, st) {
      if (Number.isFinite(st.latitude) && Number.isFinite(st.longitude)) drawForecast(body, st);
      const help = document.createElement("p"); help.className = "weather-hint"; help.textContent = t("focus.cityHint"); body.appendChild(help);
      const input = document.createElement("input"); input.placeholder = t("focus.city"); input.setAttribute("aria-label", t("focus.city")); input.value = st.city || ""; input.maxLength = 100; body.appendChild(input);
      const units = document.createElement("select"); units.setAttribute("aria-label", t("w.weather"));
      for (const unit of ["celsius", "fahrenheit"]) { const option = document.createElement("option"); option.value = unit; option.textContent = t(`premium.${unit}`); units.appendChild(option); }
      units.value = st.units || "celsius"; units.addEventListener("change", () => update({ units: units.value })); body.appendChild(units);
      const results = document.createElement("div"); results.setAttribute("role", "status");
      const search = button(t("focus.search"), async () => {
        if (!input.value.trim()) return;
        search.disabled = true; results.textContent = "…";
        try {
          const cities = await weatherSearch(input.value.trim()); results.replaceChildren();
          if (!cities.length) results.textContent = t("focus.noCity");
          for (const city of cities) button([city.name, city.admin1, city.country].filter(Boolean).join(", "), () => update({ city: city.name, latitude: city.latitude, longitude: city.longitude }), results);
        } catch (_) { results.textContent = t("focus.weatherError"); }
        finally { search.disabled = false; }
      }, body); body.appendChild(results);
    },
  };
  const glyph = (code, isDay) => {
    const kind = weatherKind(code, isDay);
    const el = document.createElement("span"); el.className = "weather-glyph"; el.innerHTML = icon(kind.icon);
    el.setAttribute("role", "img"); el.setAttribute("aria-label", t(kind.label)); el.title = t(kind.label);
    return el;
  };
  const text = (tag, className, value) => { const el = document.createElement(tag); el.className = className; el.textContent = value; return el; };
  const rainChance = (value) => {
    // Below 20% the figure is noise; leave the cell quiet.
    if (!(Number(value) >= 20)) return text("span", "weather-rain", "");
    const el = text("span", "weather-rain", `${Math.round(value)}%`); el.setAttribute("aria-label", `${t("weather.rainChance")} ${Math.round(value)}%`);
    return el;
  };
  function drawForecast(body, st) {
    const box = document.createElement("div"); box.className = "weather-forecast"; box.setAttribute("aria-busy", "true");
    box.textContent = "…"; body.appendChild(box);
    loadForecast(weatherForecast, st.latitude, st.longitude).then((data) => {
      if (disposed || !box.isConnected) return;
      const lang = curLang(), units = st.units;
      box.replaceChildren(); box.removeAttribute("aria-busy");
      const now = document.createElement("div"); now.className = "weather-now";
      const detail = document.createElement("div"); detail.className = "weather-detail";
      detail.append(text("strong", "weather-city", st.city || t("w.weather")), text("span", "", t(weatherKind(data?.now?.code).label)));
      if (data?.today) detail.append(text("span", "weather-range", `${t("weather.high")} ${formatDegrees(data.today.max, units)} · ${t("weather.low")} ${formatDegrees(data.today.min, units)}`));
      now.append(glyph(data?.now?.code, data?.now?.isDay), text("span", "weather-temp", formatDegrees(data?.now?.temperature, units)), detail);
      box.appendChild(now);
      const hours = Array.isArray(data?.hours) ? data.hours : [];
      if (hours.length) {
        box.appendChild(text("p", "weather-heading", t("weather.nextHours")));
        const list = document.createElement("ol"); list.className = "weather-hours";
        for (const hour of hours) {
          const row = document.createElement("li");
          row.append(text("span", "weather-when", formatHour(hour.time, lang)), glyph(hour.code, hour.isDay), text("span", "weather-value", formatDegrees(hour.temperature, units)), rainChance(hour.precipitation));
          list.appendChild(row);
        }
        box.appendChild(list);
      }
      const days = Array.isArray(data?.days) ? data.days : [];
      if (days.length) {
        box.appendChild(text("p", "weather-heading", t("weather.nextDays")));
        const list = document.createElement("ol"); list.className = "weather-days";
        for (const day of days) {
          const row = document.createElement("li");
          row.append(text("span", "weather-when", formatWeekday(day.date, lang)), glyph(day.code), rainChance(day.precipitation), text("span", "weather-value", `${formatDegrees(day.min, units)} / ${formatDegrees(day.max, units)}`));
          list.appendChild(row);
        }
        box.appendChild(list);
      }
    }, () => {
      if (disposed || !box.isConnected) return;
      box.removeAttribute("aria-busy"); box.textContent = t("focus.weatherError");
    });
  }
  panel.addEventListener("keydown", (event) => {
    if (!(SECTIONS[item.widget] || []).includes("calendar") || !["PageUp", "PageDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    monthOffset = event.key === "Home" ? 0 : monthOffset + (event.key === "PageDown" ? 1 : -1);
    draw();
  });
  draw();
  return panel;
}
