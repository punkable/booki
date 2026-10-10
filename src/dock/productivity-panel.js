import { t, curLang } from "../i18n.js";
import { calendarMonth, calendarWeekStart, toggleTimer, timerSeconds, formatTimer, tasksSummary } from "./productivity.js";
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
  const closeButton = document.createElement("button"); closeButton.type = "button"; closeButton.className = "stack-close";
  closeButton.innerHTML = icon("x"); closeButton.title = t("stack.close"); closeButton.setAttribute("aria-label", t("stack.close"));
  closeButton.addEventListener("click", close); head.appendChild(closeButton); panel.appendChild(head);
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
      // Countdown inside a ring that empties as the block runs.
      const total = Math.min(180, Math.max(1, Number(st.minutes) || 25)) * 60;
      const running = !!st.endsAt && timerSeconds(st) > 0;
      const dial = document.createElement("div"); dial.className = "focus-dial"; dial.classList.toggle("is-running", running);
      const ring = 2 * Math.PI * 52;
      dial.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="focus-dial-track" cx="60" cy="60" r="52"/><circle class="focus-dial-progress" cx="60" cy="60" r="52" stroke-dasharray="${ring.toFixed(2)}"/></svg>`;
      const progress = dial.querySelector(".focus-dial-progress");
      const value = document.createElement("div"); value.className = "focus-countdown"; value.setAttribute("role", "timer");
      dial.appendChild(value); body.appendChild(dial);
      const paint = () => {
        const left = timerSeconds(st);
        value.textContent = formatTimer(left);
        progress.style.strokeDashoffset = String((ring * (1 - Math.min(1, left / total))).toFixed(2));
      };
      paint();
      if (running) timer = setInterval(() => { if (!panel.isConnected) { clearInterval(timer); return; } paint(); if (timerSeconds(st) === 0) draw(); }, 1000);
      const row = document.createElement("div"); row.className = "focus-actions focus-timer-actions"; body.appendChild(row);
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "focus-primary";
      toggle.innerHTML = icon(running ? "pause" : "play"); toggle.append(text("span", "", t(running ? "focus.pause" : "focus.start")));
      toggle.addEventListener("click", () => update((current) => toggleTimer(current))); row.appendChild(toggle);
      const reset = document.createElement("button"); reset.type = "button"; reset.className = "stack-close focus-icon-button";
      reset.innerHTML = icon("refresh"); reset.title = t("focus.reset"); reset.setAttribute("aria-label", t("focus.reset"));
      reset.addEventListener("click", () => update({ endsAt: null, remaining: null })); row.appendChild(reset);
      // Duration as a stepper; the field stays editable for any value from 1 to 180.
      const minutes = Math.min(180, Math.max(1, Number(st.minutes) || 25));
      const setMinutes = (next) => update({ minutes: Math.max(1, Math.min(180, Math.round(next) || 25)), endsAt: null, remaining: null });
      const stepper = document.createElement("div"); stepper.className = "focus-stepper";
      const label = text("span", "focus-stepper-label", t("focus.duration"));
      const less = document.createElement("button"); less.type = "button"; less.innerHTML = icon("minus"); less.setAttribute("aria-label", `${t("focus.duration")} −5`); less.disabled = minutes <= 1;
      less.addEventListener("click", () => setMinutes(minutes <= 5 ? 1 : Math.ceil(minutes / 5) * 5 - 5));
      const input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = "180"; input.value = String(minutes); input.setAttribute("aria-label", t("focus.duration"));
      input.addEventListener("change", () => setMinutes(Number(input.value)));
      const more = document.createElement("button"); more.type = "button"; more.innerHTML = icon("plus"); more.setAttribute("aria-label", `${t("focus.duration")} +5`); more.disabled = minutes >= 180;
      more.addEventListener("click", () => setMinutes(minutes < 5 ? 5 : Math.floor(minutes / 5) * 5 + 5));
      const controls = document.createElement("div"); controls.className = "focus-stepper-controls"; controls.append(less, input, more);
      stepper.append(label, controls); body.appendChild(stepper);
    },
    tasks(body, st) {
      const list = Array.isArray(st.tasks) ? st.tasks : [];
      const summary = tasksSummary(list);
      const heading = document.createElement("div"); heading.className = "focus-tasks-head";
      heading.append(text("strong", "", t("w.tasks")));
      if (summary.total) heading.append(text("span", "", `${summary.done}/${summary.total}`));
      body.appendChild(heading);
      const items = document.createElement("ul"); items.className = "focus-task-list"; body.appendChild(items);
      for (const task of list) {
        const row = document.createElement("li"); row.className = "focus-task";
        const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = !!task.done;
        checkbox.setAttribute("aria-label", task.text);
        checkbox.addEventListener("change", () => { const done = checkbox.checked; update((current) => ({ tasks: (current.tasks || []).map((entry) => entry.id === task.id ? { ...entry, done } : entry) })); });
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "task-edit"; edit.textContent = task.text; edit.setAttribute("aria-label", `${t("apps.rename")}: ${task.text}`);
        edit.addEventListener("click", (event) => { event.preventDefault(); const input = document.createElement("input"); input.className = "task-rename"; input.value = task.text; input.maxLength = 200; input.setAttribute("aria-label", t("apps.rename")); edit.replaceWith(input); input.focus(); let done = false; const commit = () => { if (done) return; done = true; if (!input.value.trim()) return draw(); update((current) => ({ tasks: (current.tasks || []).map((entry) => entry.id === task.id ? { ...entry, text: input.value.trim() } : entry) })); }; input.addEventListener("blur", commit); input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { done = true; draw(); } }); }); label.append(checkbox, edit); row.appendChild(label);
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "stack-close focus-task-remove"; remove.innerHTML = icon("x");
        remove.title = t("apps.remove"); remove.setAttribute("aria-label", `${t("apps.remove")}: ${task.text}`);
        remove.addEventListener("click", () => update((current) => ({ tasks: (current.tasks || []).filter((entry) => entry.id !== task.id) }))); row.appendChild(remove);
        items.appendChild(row);
      }
      const form = document.createElement("form"); form.className = "focus-add-task";
      const input = document.createElement("input"); input.className = "focus-new-task"; input.placeholder = t("focus.newTask"); input.setAttribute("aria-label", t("focus.newTask")); input.maxLength = 200; input.autocomplete = "off";
      const add = document.createElement("button"); add.type = "submit"; add.className = "weather-search-go"; add.innerHTML = icon("plus"); add.title = t("focus.newTask"); add.setAttribute("aria-label", t("focus.newTask"));
      form.append(input, add);
      form.addEventListener("submit", (event) => {
        event.preventDefault(); const value = input.value.trim();
        if (!value || input.disabled || list.length >= 100) return;
        input.disabled = true; add.disabled = true;
        update((current) => ({ tasks: [...(current.tasks || []), { id: crypto.randomUUID(), text: value, done: false }] })).finally(() => {
          input.disabled = false; add.disabled = false;
          if (panel.isConnected) panel.querySelector(".focus-new-task")?.focus();
        });
      }); body.appendChild(form);
    },
    calendar(body) {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const nav = document.createElement("div"); nav.className = "focus-month"; body.appendChild(nav);
      const label = text("strong", "focus-month-title", date.toLocaleDateString(curLang(), { month: "long", year: "numeric" })); label.setAttribute("aria-live", "polite"); nav.appendChild(label);
      if (monthOffset !== 0) { const today = document.createElement("button"); today.type = "button"; today.className = "focus-today"; today.textContent = t("focus.today"); today.addEventListener("click", () => { monthOffset = 0; draw(); }); nav.appendChild(today); }
      for (const [name, step, key] of [["chevron-left", -1, "premium.previousMonth"], ["chevron-right", 1, "premium.nextMonth"]]) {
        const go = document.createElement("button"); go.type = "button"; go.className = "stack-close"; go.innerHTML = icon(name); go.title = t(key); go.setAttribute("aria-label", t(key));
        go.addEventListener("click", () => { monthOffset += step; draw(); }); nav.appendChild(go);
      }
      const grid = document.createElement("div"); grid.className = "focus-calendar";
      const weekStart = calendarWeekStart(navigator.language || curLang());
      for (let i = 0; i < 7; i++) { const cell = document.createElement("strong"); cell.textContent = new Date(2024, 0, 7 + weekStart + i).toLocaleDateString(curLang(), { weekday: "narrow" }); grid.appendChild(cell); }
      for (const day of calendarMonth(date, weekStart)) { const cell = document.createElement("span"); cell.textContent = day ? String(day) : ""; if (monthOffset === 0 && day === now.getDate()) { cell.className = "today"; cell.setAttribute("aria-label", `${t("focus.today")}, ${day}`); cell.setAttribute("aria-current", "date"); } grid.appendChild(cell); } body.appendChild(grid);
    },
    weather(body, st) {
      const hasCity = Number.isFinite(st.latitude) && Number.isFinite(st.longitude);
      if (hasCity) drawForecast(body, st);
      else {
        const empty = document.createElement("div"); empty.className = "weather-empty";
        const art = document.createElement("span"); art.className = "weather-glyph"; art.setAttribute("aria-hidden", "true"); art.innerHTML = icon("cloud-sun");
        empty.append(art, text("strong", "", t("focus.noCity")), text("span", "", t("weather.emptyHint")));
        body.appendChild(empty);
      }
      // City search: one field, Enter or the button searches, results are rows.
      const form = document.createElement("form"); form.className = "weather-search"; form.setAttribute("role", "search");
      const lens = document.createElement("span"); lens.className = "weather-search-icon"; lens.setAttribute("aria-hidden", "true"); lens.innerHTML = icon("search");
      const input = document.createElement("input"); input.type = "search"; input.placeholder = t("weather.searchCity");
      input.setAttribute("aria-label", t("focus.city")); input.maxLength = 100; input.autocomplete = "off"; input.spellcheck = false;
      const submit = document.createElement("button"); submit.type = "submit"; submit.className = "weather-search-go";
      submit.innerHTML = icon("chevron-right"); submit.title = t("focus.search"); submit.setAttribute("aria-label", t("focus.search"));
      form.append(lens, input, submit); body.appendChild(form);
      const results = document.createElement("ul"); results.className = "weather-results"; results.setAttribute("aria-live", "polite"); body.appendChild(results);
      const status = (message) => { results.replaceChildren(); if (message) results.appendChild(text("li", "weather-results-note", message)); };
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const query = input.value.trim(); if (!query || submit.disabled) return;
        submit.disabled = true; form.setAttribute("aria-busy", "true"); status("…");
        try {
          const cities = await weatherSearch(query);
          if (disposed) return;
          status(cities.length ? "" : t("weather.noResults"));
          for (const city of cities) {
            const place = [city.admin1, city.country].filter(Boolean).join(", ");
            const row = document.createElement("li");
            const pick = document.createElement("button"); pick.type = "button"; pick.className = "weather-result";
            pick.setAttribute("aria-label", [city.name, place].filter(Boolean).join(", "));
            const current = st.latitude === city.latitude && st.longitude === city.longitude;
            if (current) pick.setAttribute("aria-current", "true");
            pick.append(text("strong", "", city.name), text("span", "", place));
            if (current) { const tick = document.createElement("span"); tick.className = "weather-result-tick"; tick.setAttribute("aria-hidden", "true"); tick.innerHTML = icon("check"); pick.appendChild(tick); }
            pick.addEventListener("click", () => update({ city: city.name, latitude: city.latitude, longitude: city.longitude }));
            row.appendChild(pick); results.appendChild(row);
          }
        } catch (_) { if (!disposed) status(t("focus.weatherError")); }
        finally { submit.disabled = false; form.removeAttribute("aria-busy"); }
      });
      // Units as a two-way switch rather than a dropdown.
      const footer = document.createElement("div"); footer.className = "weather-footer";
      const unitGroup = document.createElement("div"); unitGroup.className = "weather-units"; unitGroup.setAttribute("role", "radiogroup"); unitGroup.setAttribute("aria-label", t("weather.units"));
      const chosen = st.units === "fahrenheit" ? "fahrenheit" : "celsius";
      for (const [unit, label] of [["celsius", "°C"], ["fahrenheit", "°F"]]) {
        const option = document.createElement("button"); option.type = "button"; option.textContent = label;
        option.setAttribute("role", "radio"); option.setAttribute("aria-checked", String(unit === chosen)); option.title = t(`premium.${unit}`);
        option.setAttribute("aria-label", t(`premium.${unit}`)); option.tabIndex = unit === chosen ? 0 : -1;
        option.addEventListener("click", () => { if (unit !== chosen) update({ units: unit }); });
        option.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); update({ units: chosen === "celsius" ? "fahrenheit" : "celsius" }).then(() => panel.querySelector('.weather-units [aria-checked="true"]')?.focus());
        });
        unitGroup.appendChild(option);
      }
      const privacy = document.createElement("p"); privacy.className = "weather-privacy";
      const shield = document.createElement("span"); shield.setAttribute("aria-hidden", "true"); shield.innerHTML = icon("shield");
      privacy.append(shield, text("span", "", t("weather.privacy")));
      footer.append(unitGroup, privacy); body.appendChild(footer);
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
    const box = document.createElement("div"); box.className = "weather-forecast is-loading"; box.setAttribute("aria-busy", "true");
    box.append(text("div", "weather-skeleton", ""), text("div", "weather-skeleton", ""), text("div", "weather-skeleton", ""));
    body.appendChild(box);
    loadForecast(weatherForecast, st.latitude, st.longitude).then((data) => {
      if (disposed || !box.isConnected) return;
      const lang = curLang(), units = st.units;
      box.replaceChildren(); box.removeAttribute("aria-busy"); box.classList.remove("is-loading");
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
      box.removeAttribute("aria-busy"); box.classList.remove("is-loading"); box.classList.add("is-error");
      box.replaceChildren(text("span", "", t("focus.weatherError")));
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "productivity-button"; retry.textContent = t("focus.retry");
      retry.addEventListener("click", () => draw()); box.appendChild(retry);
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
