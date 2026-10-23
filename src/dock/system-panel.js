/* Native widget details and optional providers. Every async result belongs to
   this panel instance; closing it prevents late results from repainting it. */
import { dock as api, pickRgbProfile } from "../api.js";
import { t, curLang } from "../i18n.js";
import { icon } from "../icons.js";
import PLUGINS from "../plugin-catalog.json";
import { pluginError } from "../plugin-errors.js";
import { S } from "./state.js";
import { persist } from "./config-sync.js";
import { addWidget } from "./pin-ops.js";
import { buildCollectorPanel } from "./collector-panel.js";
import { deviceReading, aiReading, tokenText, updatesReading, shownUpdates, matchDevice, batteryTone, usageTone } from "./readings.js";
import { refreshUpdates, refreshDevices, paintLighting } from "./live-widgets.js";
import { notify } from "./notices.js";

function text(tag, value, className = "") {
  const el = document.createElement(tag); el.textContent = value; el.className = className; return el;
}
export function buildSystemPanel(item, { close }) {
  const panel = document.createElement("section"); panel.className = "productivity-panel system-widget-panel";
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", t(`w.${item.widget}`));
  let disposed = false;
  const unsubscribe = [];
  panel.dispose = () => { disposed = true; unsubscribe.forEach((off) => off()); };
  const head = document.createElement("div"); head.className = "productivity-head";
  const done = document.createElement("button"); done.type = "button"; done.className = "stack-close";
  done.innerHTML = icon("x"); done.setAttribute("aria-label", t("stack.close")); done.addEventListener("click", close);
  head.append(text("strong", t(`w.${item.widget}`)), done); panel.append(head);
  const body = document.createElement("div"); body.className = "system-widget-sections"; panel.append(body);
  const button = (container, label, action) => {
    const b = text("button", label, "productivity-button"); b.type = "button";
    b.addEventListener("click", async () => {
      const original = b.innerHTML;
      b.disabled = true;
      const previous = container.querySelector(":scope > .plugin-action-error"); previous?.remove();
      try { await action(); }
      catch (error) { if (!disposed) { const message = text("p", pluginError(error), "plugin-action-error"); message.setAttribute("role", "alert"); container.append(message); } }
      finally { if (!disposed) { b.disabled = false; b.innerHTML = original; } }
    }); container.append(b); return b;
  };
  // Installing anything third-party first asks once for the plugin terms:
  // a checkbox beside the button, and the button waits for it.
  const TERMS_URL = "https://github.com/punkable/booki/blob/main/TERMS.md";
  const installButton = (container, label, id, after) => {
    const accepted = () => (S.cfg?.pluginTerms || 0) >= 1;
    let box = null;
    if (!accepted()) {
      const row = document.createElement("label"); row.className = "terms-check";
      box = document.createElement("input"); box.type = "checkbox";
      const link = text("button", t("plugins.termsLink"), "link"); link.type = "button";
      link.addEventListener("click", (e) => { e.preventDefault(); api.launch(TERMS_URL, []); });
      row.append(box, text("span", t("plugins.acceptTerms")), link);
      container.append(row);
    }
    const b = button(container, label, async () => {
      if (!accepted()) {
        if (!(await persist({ pluginTerms: 1 }))) throw new Error(t("status.saveError"));
        S.cfg.pluginTerms = 1;
      }
      await api.pluginInstall(id); await after?.();
    });
    if (box) { b.disabled = true; box.addEventListener("change", () => { b.disabled = !box.checked; }); }
    return b;
  };
  const section = (title) => { const el = document.createElement("section"); el.className = "productivity-section"; if (title !== t(`w.${item.widget}`)) el.append(text("strong", title)); body.append(el); return el; };
  const list = (container, rows) => {
    const dl = document.createElement("dl"); dl.className = "system-widget-readings";
    for (const [label, value] of rows) dl.append(text("dt", label), text("dd", value));
    container.append(dl);
  };
  const reads = new WeakMap();
  const load = async (container, action, paint) => {
    const request = Symbol(); reads.set(container, request);
    const loading = text("p", t("overhaul.loading")); container.append(loading);
    try { const data = await action(); if (!disposed && reads.get(container) === request) { loading.remove(); paint(data); } }
    catch (error) { if (!disposed && reads.get(container) === request) { loading.textContent = pluginError(error); loading.setAttribute("role", "alert"); button(container, t("focus.retry"), () => { loading.remove(); return load(container, action, paint); }); } }
  };
  // Cards from a shared reading: the last value paints at once (no "Loading"
  // on reopen), then a fresh one replaces it when it lands.
  const live = (container, reading, maxAge, paint) => {
    const draw = (data) => {
      if (disposed) return;
      const open = new Set([...container.querySelectorAll("details.reading-card[open]")].map((card) => card.dataset.readingKey));
      const focused = container.contains(document.activeElement) ? document.activeElement.closest("details.reading-card")?.dataset.readingKey : null;
      container.querySelectorAll(":scope > .reading-cards, :scope > p, :scope > .productivity-button").forEach((el) => el.remove());
      paint(data);
      container.querySelectorAll("details.reading-card").forEach((card) => {
        card.open = open.has(card.dataset.readingKey);
        if (focused && card.dataset.readingKey === focused) card.querySelector("summary")?.focus({ preventScroll: true });
      });
    };
    unsubscribe.push(reading.subscribe(draw));
    if (reading.last !== undefined) { draw(reading.last); reading.fresh(maxAge).catch(() => {}); }
    else load(container, () => reading.fresh(maxAge), () => {});
  };
  const cards = (container, rows) => {
    const grid = document.createElement("div"); grid.className = "reading-cards";
    for (const row of rows) {
      const card = document.createElement(row.details ? "details" : "div"); card.className = "reading-card"; card.dataset.readingKey = row.name; if (row.tone) card.dataset.tone = row.tone;
      const top = document.createElement(row.details ? "summary" : "div"); top.className = "reading-card-top";
      if (row.glyph) { const g = text("span", "", "reading-card-glyph"); g.innerHTML = icon(row.glyph); top.append(g); }
      const names = document.createElement("div"); names.className = "reading-card-names";
      names.append(text("strong", row.name)); if (row.sub) names.append(text("small", row.sub));
      top.append(names);
      if (row.error) top.append(text("span", row.error, "reading-card-note"));
      if (row.value) top.append(text("span", row.value, "reading-card-value"));
      card.append(top);
      for (const bar of row.bars || []) {
        const line = document.createElement("div"); line.className = "reading-bar";
        if (bar.label) line.append(text("span", bar.label), text("span", `${Math.round(bar.percent)}%`, "reading-bar-value"));
        const track = document.createElement("div"); track.className = "reading-bar-track";
        track.setAttribute("role", "meter"); track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(Math.round(bar.percent))); track.setAttribute("aria-label", `${row.name} ${bar.label || t("w.battery")}`);
        const fill = document.createElement("i"); fill.style.width = `${Math.max(0, Math.min(100, bar.percent))}%`;
        if (bar.tone) fill.dataset.tone = bar.tone;
        track.append(fill); line.append(track); card.append(line);
      }
      if (row.details) { list(card, row.details); card.append(text("small", t("refine.deviceNote"), "device-reading-note")); }
      grid.append(card);
    }
    container.append(grid);
  };
  if (item.widget === "media") {
    const transport = section(t("w.media"));
    load(transport, api.mediaInfo, (media) => { transport.append(text("p", media?.title ? (media.artist ? `${media.title} · ${media.artist}` : media.title) : t("plugins.noData"))); });
    for (const [glyph, action] of [["chevron-left", api.mediaPrev], ["play", api.mediaToggle], ["chevron-right", api.mediaNext]]) {
      const control = button(transport, "", action); control.innerHTML = icon(glyph); control.setAttribute("aria-label", t(`w.${glyph === "play" ? "playPause" : glyph === "chevron-left" ? "prev" : "next"}`));
    }
  }
  if (item.widget === "battery") {
    const battery = section(t("w.battery"));
    load(battery, api.systemStats, (stats) => {
      if (!(stats?.battery >= 0)) { battery.append(text("p", t("plugins.noData"))); return; }
      cards(battery, [{ name: t(stats.charging ? "dev.charging" : "w.battery"), glyph: "battery", value: `${stats.battery}%`, bars: [{ label: "", percent: stats.battery, tone: batteryTone(stats.battery, !!stats.charging) }] }]);
    });
  }
  if (item.widget === "ai") {
    const ai = section(t("w.ai"));
    const icons = { claude: "ai-claude", chatgpt: "ai-openai", codex: "ai-openai" };
    const windowName = (label) => (label === "week" ? t("w.aiWeek") : label);
    const clock = (s) => (s > 0 ? new Date(s * 1000).toLocaleString(curLang(), { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");
    const withReset = (label, s) => { const r = clock(s); return r ? `${label} · ${t("w.aiResets").replace("{time}", () => r)}` : label; };
    const tokens = (n) => t("w.aiTokens").replace("{n}", () => tokenText(n));
    live(ai, aiReading, 60000, (providers) => {
      const all = Array.isArray(providers) ? providers : [];
      if (!all.length) { ai.append(text("p", t("w.aiNone"))); return; }
      cards(ai, all.map((p) => {
        const windows = p.windows || [];
        const sub = t("w.aiWeekTokens").replace("{n}", () => tokens(p.week_tokens));
        if (windows.length) {
          return {
            name: p.name, glyph: icons[p.id] || "sparkles", sub,
            tone: usageTone(Math.max(0, ...windows.map((w) => w.percent))),
            bars: windows.map((w) => ({ label: withReset(windowName(w.label), w.resets_at), percent: w.percent, tone: usageTone(w.percent) })),
          };
        }
        if (p.block) {
          // Local logs hold no plan limit: the bar is time elapsed in the
          // 5-hour block, the value is the tokens spent in it.
          return {
            name: p.name, glyph: icons[p.id] || "sparkles", sub, value: tokens(p.block.tokens),
            bars: [{ label: withReset(t("w.aiBlockElapsed").replace("{n}", () => Math.round(p.block.elapsed_percent)), p.block.resets_at), percent: p.block.elapsed_percent, tone: "good" }],
          };
        }
        return { name: p.name, glyph: icons[p.id] || "sparkles", sub: p.week_tokens > 0 ? sub : "", error: t("w.aiIdle"), bars: [] };
      }));
      const ids = new Set(all.map((p) => p.id));
      if (!ids.has("claude")) ai.append(text("p", t("w.aiNoClaude")));
      if (!ids.has("codex") && !ids.has("chatgpt")) ai.append(text("p", t("w.aiNoCodex")));
      ai.append(text("p", t("w.aiLocal")));
    });
  }
  if (item.widget === "volume") {
    const master = section(t("w.volume"));
    load(master, api.volumeInfo, (value) => {
      if (!Array.isArray(value)) { master.append(text("p", t("plugins.noData"))); return; }
      volumeRow(master, t("w.volume"), value[0], value[1], (percent, muted) => api.masterVolumeSet(percent, muted));
    });
    const apps = section(t("plugins.audioApps"));
    const sessionList = document.createElement("div"); apps.append(sessionList);
    const refresh = () => {
      sessionList.replaceChildren();
      return load(sessionList, api.appVolumes, (sessions) => {
        if (!Array.isArray(sessions) || !sessions.length) { sessionList.append(text("p", t("plugins.noSessions"))); return; }
        for (const session of sessions) volumeRow(sessionList, session.name, session.percent, session.muted, (percent, muted) => api.appVolumeSet(session.id, percent, muted));
      });
    };
    button(apps, t("plugins.refresh"), refresh);
    refresh();
  }
  if (item.widget === "devices") {
    const devices = section(t("w.devices"));
    const actions = document.createElement("div"); actions.className = "plugin-panel-actions";
    body.append(actions);
    button(actions, t("plugins.refresh"), refreshDevices);
    button(actions, t("dev.bluetoothSettings"), () => api.launch("ms-settings:bluetooth", []));
    live(devices, deviceReading, 30000, (values) => {
      if (!Array.isArray(values) || !values.length) { devices.append(text("p", t("w.devicesNone"))); return; }
      const own = item.style?.device;
      const shown = own ? [matchDevice(values, own, item.style?.deviceKind)].filter(Boolean) : values;
      if (!shown.length) { devices.append(text("p", t("w.devicesNone"))); return; }
      cards(devices, shown.map((d) => ({
        name: d.name, sub: d.charging ? t("dev.charging") : d.level <= 20 ? t("dev.low") : "", tone: batteryTone(d.level, d.charging), glyph: { headset: "headphones", mouse: "mouse", keyboard: "device-keyboard", gamepad: "gamepad" }[d.kind] || "battery",
        value: `${d.level}%`, bars: [{ label: "", percent: d.level, tone: batteryTone(d.level, d.charging) }],
        details: [[t("refine.source"), ({ bluetooth: "Bluetooth", headsetcontrol: "HeadsetControl", logitech: "Logitech HID++", hidpp: "Logitech HID++", xinput: "Xbox" })[d.source] || d.source || t("plugins.noData")], [t("refine.readAt"), deviceReading.checkedAt ? new Date(deviceReading.checkedAt).toLocaleTimeString(curLang(), { hour: "2-digit", minute: "2-digit" }) : "—"]],
      })));
      // Each device can have its own card on the dock, beside this one.
      if (own) return;
      const pinnedDevices = new Set(allWidgetPins("devices").map((p) => p.style?.device).filter(Boolean));
      devices.querySelectorAll(".reading-card").forEach((card, i) => {
        if (pinnedDevices.has(shown[i].name)) return;
        const row = document.createElement("div"); row.className = "plugin-panel-actions"; card.append(row);
        button(row, t("dev.ownCard"), async () => {
          if (!(await addWidget("devices", { style: { device: shown[i].name, deviceKind: shown[i].kind }, after: item.id }))) throw new Error(t("status.saveError"));
          row.remove();
        });
      });
    });
  }
  if (item.widget === "system") {
    const native = section(t("w.system"));
    load(native, api.systemStats, (stats) => {
      if (!stats) { native.append(text("p", t("plugins.noData"))); return; }
      list(native, [["CPU", `${Math.round(stats.cpu || 0)}%`], ["RAM", `${Math.round(stats.mem || 0)}%`]]);
    });
  }
  if (item.widget === "collector") {
    buildCollectorPanel(item, { box: section(t("w.collector")), button, installButton, isDisposed: () => disposed, onDispose: (off) => unsubscribe.push(off) });
    const gear = document.createElement("button"); gear.type = "button"; gear.className = "stack-close";
    gear.innerHTML = icon("settings"); gear.title = t("refine.collectorSettings"); gear.setAttribute("aria-label", t("refine.collectorSettings"));
    gear.addEventListener("click", () => { const preferences = body.querySelector(".collector-settings"); preferences.open = !preferences.open; preferences.scrollIntoView({ block: "nearest" }); });
    head.insertBefore(gear, done);
  }
  // A widget whose plugin is missing offers it in one line, terms included.
  const needsPlugin = (id, container, onReady) => api.pluginStatus(id).then((state) => {
    if (disposed) return;
    if (state?.installed) { onReady(); return; }
    const offer = document.createElement("div"); offer.className = "device-offer";
    offer.append(text("span", t(`widget.${item.widget}Desc`)));
    installButton(offer, t("dev.enable"), id, () => { offer.remove(); onReady(); });
    container.append(offer);
  }).catch(() => onReady());
  if (item.widget === "updates") {
    // A Windows-style list: one row per app with Update and a quiet Skip.
    // winget installs one thing at a time, so Booki queues them: while one
    // runs the other Update buttons wait, and Update all goes row by row so
    // each one shows its own progress. A failure stays on its own row.
    const box = section(t("w.updates"));
    let latest = null;
    let running = false;
    const versionLine = (u) => (!u.current || /^unknown$/i.test(u.current)) ? t("up.newVersion").replace("{v}", () => u.available) : `${u.current} → ${u.available}`;
    const paint = (raw) => {
      latest = raw;
      // A fresh reading must not rebuild the list under a running update.
      if (running) return;
      const list = shownUpdates(raw, S.cfg?.ignoredUpdates);
      box.querySelectorAll(":scope > *:not(strong)").forEach((el) => el.remove());
      if (!Array.isArray(list)) { box.append(text("p", t("perr.appInstaller"))); return; }
      if (!list.length) { box.append(text("p", t("up.none"), "update-empty")); return; }
      const bar = document.createElement("div"); bar.className = "update-bar";
      const count = text("span", t("up.some").replace("{n}", () => list.length), "update-count");
      const all = text("button", t("up.all"), "productivity-button primary"); all.type = "button";
      bar.append(count, all);
      const rows = document.createElement("ul"); rows.className = "update-list";
      const entries = list.map((u) => {
        const row = document.createElement("li"); row.className = "update-row";
        const glyph = text("span", "", "update-glyph"); glyph.innerHTML = icon("refresh");
        const names = document.createElement("div"); names.className = "update-names";
        const sub = text("small", versionLine(u));
        names.append(text("strong", u.name), sub);
        const go = text("button", t("up.one"), "productivity-button"); go.type = "button";
        const skip = document.createElement("button"); skip.type = "button"; skip.className = "update-skip";
        skip.innerHTML = icon("eye-off"); skip.title = t("up.skip"); skip.setAttribute("aria-label", `${t("up.skip")}: ${u.name}`);
        row.append(glyph, names, go, skip); rows.append(row);
        return { u, row, sub, go, skip };
      });
      const skipUpdate = async (e) => {
        const key = `${e.u.id}@${e.u.available}`;
        const ignored = [...new Set([...(S.cfg?.ignoredUpdates || []), key])].slice(-200);
        if (!(await persist({ ignoredUpdates: ignored }))) { e.sub.textContent = t("status.saveError"); e.row.classList.add("has-error"); return false; }
        S.cfg.ignoredUpdates = ignored; e.row.remove();
        return true;
      };
      const lock = (on) => { running = on; all.disabled = on; for (const e of entries) if (e.row.isConnected) e.go.disabled = on; };
      const updateOne = async (e) => {
        e.row.classList.add("is-working"); e.row.classList.remove("has-error");
        e.go.textContent = t("up.working"); e.sub.textContent = versionLine(e.u);
        try {
          await api.appUpdate(e.u.id);
          e.row.classList.add("is-done"); e.sub.textContent = t("up.updated");
          setTimeout(() => e.row.remove(), 900);
          return true;
        } catch (error) {
          if (disposed) return false;
          // An update winget can't apply leaves the list for good.
          if (String(error).includes("not-applicable")) { await skipUpdate(e); return true; }
          e.row.classList.add("has-error"); e.sub.textContent = pluginError(error);
          e.go.textContent = t("focus.retry");
          return false;
        } finally { e.row.classList.remove("is-working"); }
      };
      for (const e of entries) {
        e.go.addEventListener("click", async () => {
          if (running) return;
          lock(true); await updateOne(e); if (!disposed) lock(false);
          refreshUpdates();
        });
        e.skip.addEventListener("click", async () => { if (await skipUpdate(e)) { paint(latest); refreshUpdates(); } });
      }
      all.addEventListener("click", async () => {
        if (running) return;
        lock(true); all.textContent = t("up.working");
        let failed = 0;
        for (const e of entries) { if (disposed) return; if (e.row.isConnected && !(await updateOne(e))) failed++; }
        if (disposed) return;
        lock(false); all.textContent = t("up.all");
        notify(failed ? t("up.someFailed").replace("{n}", () => failed) : t("up.done"));
        refreshUpdates();
      });
      box.append(bar, rows);
    };
    live(box, updatesReading, 6 * 3600000, paint);
  }
  if (item.widget === "lighting") {
    const box = section(t("w.lighting"));
    needsPlugin("openrgb", box, () => {
      load(box, api.rgbProfiles, (profiles) => {
        const actions = document.createElement("div"); actions.className = "rgb-profiles"; box.append(actions);
        const apply = (name) => async () => {
          await api.rgbApply(name);
          try { localStorage.setItem("booki.rgbProfile", name || "\u0000off"); } catch (_) { /* private mode */ }
          paintLighting(); notify(t("rgb.applied"), name || t("rgb.off"));
        };
        if (!Array.isArray(profiles) || !profiles.length) box.insertBefore(text("p", t("rgb.none")), actions);
        else for (const name of profiles) button(actions, name, apply(name));
        button(actions, t("rgb.off"), apply(null));
        button(actions, t("rgb.open"), () => api.pluginOpen("openrgb"));
      });
    });
  }
  const ids = item.widget === "devices" ? ["headsetcontrol"] : item.widget === "system" ? ["librehardwaremonitor"] : [];
  // Devices: support for USB headsets is a one-line offer while it is off,
  // and invisible once it is on. No plugin name, no description.
  if (item.widget === "devices") {
    const offer = document.createElement("div"); offer.className = "device-offer";
    api.pluginStatus("headsetcontrol").then((status) => {
      if (disposed || status?.installed) return;
      offer.append(text("span", t("dev.missingHeadset")));
      installButton(offer, t("dev.enable"), "headsetcontrol", () => { offer.remove(); deviceReading.refresh().catch(() => {}); });
      body.append(offer);
    }).catch(() => {});
  }
  for (const id of ids.filter((id) => id !== "headsetcontrol")) {
    const plugin = PLUGINS.find((p) => p.id === id);
    const box = section(plugin.name);
    box.append(text("p", t(`plugins.${id}.desc`)));
    if (id === "librehardwaremonitor") box.append(text("p", t("plugins.sensorWarning"), "plugin-warning"));
    const controls = document.createElement("div"); controls.className = "plugin-panel-actions"; box.append(controls);
    const state = text("span", t("overhaul.loading")); controls.append(state);
    const show = async () => {
      const status = await api.pluginStatus(id);
      if (disposed) return;
      controls.replaceChildren();
      if (!status?.installed) {
        if (plugin.external) button(controls, t("plugins.appInstaller"), () => api.launch("ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1", []));
        else installButton(controls, t("plugins.installForWidget"), id, show);
        return;
      }
      controls.append(text("small", via(plugin.name)));
      if (["winget", "librehardwaremonitor"].includes(id)) button(controls, t("plugins.refresh"), async () => {
        const result = await api.pluginRead(id);
        if (disposed) return;
        box.querySelector(".plugin-result")?.remove();
        const output = text("pre", formatPluginResult(id, result), "plugin-result"); output.tabIndex = 0; box.append(output);
      });
      if (["openrgb", "librehardwaremonitor"].includes(id)) button(controls, t(id === "librehardwaremonitor" ? "plugins.openAdmin" : "system.open"), () => api.pluginOpen(id));
      if (id === "openrgb") button(controls, t("plugins.profile"), async () => { const path = await pickRgbProfile(); if (path) await api.pluginOpen(id, path); });
    };
    show().catch((error) => { if (!disposed) { state.textContent = pluginError(error); button(controls, t("focus.retry"), show); } });
  }
  function volumeRow(container, name, percent, muted, save) {
    const row = document.createElement("div"); row.className = "app-volume-row";
    const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "100"; input.value = String(percent); input.setAttribute("aria-label", name);
    const value = text("output", `${percent}%`); input.addEventListener("input", () => { value.textContent = `${input.value}%`; });
    // Commit on release/keyboard change. Serialize volume and mute writes so
    // rapid input can never let an older request overwrite the newest one.
    let queue = Promise.resolve();
    // Mute is a speaker toggle button, like the Windows volume mixer.
    const mute = document.createElement("button"); mute.type = "button"; mute.className = "mute-toggle";
    mute.checked = muted;
    const paintMute = () => { mute.setAttribute("aria-pressed", String(mute.checked)); mute.innerHTML = icon(mute.checked ? "volume-x" : "volume"); mute.title = t("w.muted"); };
    mute.setAttribute("aria-label", `${name} · ${t("w.muted")}`); paintMute();
    mute.addEventListener("click", () => { mute.checked = !mute.checked; paintMute(); mute.dispatchEvent(new Event("change")); });
    const commit = () => {
      const wanted = [Number(input.value), mute.checked];
      queue = queue.catch(() => {}).then(() => save(...wanted)).catch((error) => {
        if (!disposed) { row.querySelector(".plugin-action-error")?.remove(); const message = text("span", pluginError(error), "plugin-action-error"); message.setAttribute("role", "alert"); row.append(message); }
      });
    };
    input.addEventListener("change", commit); mute.addEventListener("change", commit);
    const sync = () => input.style.setProperty("--pct", `${input.value}%`);
    input.addEventListener("input", sync); sync();
    row.append(text("span", name), input, value, mute); container.append(row);
  }
  return panel;
}
function via(name) { return t("w.devicesVia").replace("{plugin}", () => name); }
/** Every pin of one widget type, inside groups too. */
function allWidgetPins(type, items = S.cfg?.pinned || []) {
  return items.flatMap((p) => (p.kind === "group" ? allWidgetPins(type, p.children || []) : p.kind === "widget" && p.widget === type ? [p] : []));
}
export function videoUrl(value) {
  try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function formatPluginResult(id, value) {
  if (id === "winget") return String(value || t("plugins.noData"));
  let data;
  try { data = typeof value === "string" ? JSON.parse(value) : value; } catch { return t("plugins.noData"); }
  const rows = [];
  function visit(node, depth = 0) {
    if (!node || depth > 32 || rows.length >= 128) return;
    if (typeof node.Value === "string" && /°C|RPM/i.test(node.Value)) rows.push(`${node.Text}: ${node.Value}`);
    if (Array.isArray(node.Children)) for (const child of node.Children.slice(0, 256)) visit(child, depth + 1);
  }
  visit(data); return rows.join("\n") || t("plugins.noData");
}
