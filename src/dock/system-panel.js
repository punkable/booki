/* Native widget details and optional providers. Every async result belongs to
   this panel instance; closing it prevents late results from repainting it. */
import { dock as api, pickFolder, pickRgbProfile } from "../api.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import PLUGINS from "../plugin-catalog.json";
import { deviceReading, aiReading } from "./readings.js";

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
      b.disabled = true;
      const previous = container.querySelector(":scope > .plugin-action-error"); previous?.remove();
      try { await action(); }
      catch (error) { if (!disposed) { const message = text("p", `${t("plugins.failed")} ${String(error)}`, "plugin-action-error"); message.setAttribute("role", "alert"); container.append(message); } }
      finally { if (!disposed) b.disabled = false; }
    }); container.append(b); return b;
  };
  const section = (title) => { const el = document.createElement("section"); el.className = "productivity-section"; el.append(text("strong", title)); body.append(el); return el; };
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
    catch (error) { if (!disposed && reads.get(container) === request) { loading.textContent = `${t("plugins.failed")} ${String(error)}`; loading.setAttribute("role", "alert"); button(container, t("focus.retry"), () => { loading.remove(); return load(container, action, paint); }); } }
  };
  // Cards from a shared reading: the last value paints at once (no "Loading"
  // on reopen), then a fresh one replaces it when it lands.
  const live = (container, reading, maxAge, paint) => {
    const draw = (data) => { if (!disposed) { container.querySelector(":scope > .reading-cards, :scope > p")?.remove(); paint(data); } };
    unsubscribe.push(reading.subscribe(draw));
    if (reading.last !== undefined) { draw(reading.last); reading.fresh(maxAge).catch(() => {}); }
    else load(container, () => reading.fresh(maxAge), () => {});
  };
  const cards = (container, rows) => {
    const grid = document.createElement("div"); grid.className = "reading-cards";
    for (const row of rows) {
      const card = document.createElement("div"); card.className = "reading-card";
      const top = document.createElement("div"); top.className = "reading-card-top";
      if (row.glyph) { const g = text("span", "", "reading-card-glyph"); g.innerHTML = icon(row.glyph); top.append(g); }
      const names = document.createElement("div"); names.className = "reading-card-names";
      names.append(text("strong", row.name)); if (row.sub) names.append(text("small", row.sub));
      top.append(names);
      if (row.error) top.append(text("span", row.error, "reading-card-note"));
      card.append(top);
      for (const bar of row.bars || []) {
        const line = document.createElement("div"); line.className = "reading-bar";
        line.append(text("span", bar.label), text("span", `${Math.round(bar.percent)}%`, "reading-bar-value"));
        const track = document.createElement("div"); track.className = "reading-bar-track";
        track.setAttribute("role", "meter"); track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(Math.round(bar.percent))); track.setAttribute("aria-label", `${row.name} ${bar.label}`);
        const fill = document.createElement("i"); fill.style.width = `${Math.max(0, Math.min(100, bar.percent))}%`;
        if (bar.warn) fill.className = "warn";
        track.append(fill); line.append(track); card.append(line);
      }
      grid.append(card);
    }
    container.append(grid);
  };
  if (item.widget === "media") {
    const transport = section(t("w.media"));
    load(transport, api.mediaInfo, (media) => { transport.append(text("p", media?.title ? `${media.title} · ${media.artist || ""}` : t("plugins.noData"))); });
    for (const [glyph, action] of [["chevron-left", api.mediaPrev], ["play", api.mediaToggle], ["chevron-right", api.mediaNext]]) {
      const control = button(transport, "", action); control.innerHTML = icon(glyph); control.setAttribute("aria-label", t(`w.${glyph === "play" ? "playPause" : glyph === "chevron-left" ? "prev" : "next"}`));
    }
  }
  if (item.widget === "battery") {
    const battery = section(t("w.battery"));
    load(battery, api.systemStats, (stats) => { list(battery, [[t("w.battery"), stats?.battery >= 0 ? `${stats.battery}%` : t("plugins.noData")]]); });
  }
  if (item.widget === "ai") {
    const ai = section(t("w.ai"));
    const icons = { claude: "ai-claude", codex: "ai-openai" };
    const windowName = (label) => (label === "week" ? t("w.aiWeek") : label);
    live(ai, aiReading, 60000, (providers) => {
      const all = Array.isArray(providers) ? providers : [];
      if (!all.length) { ai.append(text("p", t("w.aiNone"))); return; }
      cards(ai, all.map((p) => ({
        name: p.name, glyph: icons[p.id] || "sparkles",
        error: (p.windows || []).length ? "" : t(p.error === "signin" ? "w.aiSignin" : "w.aiUnavailable"),
        bars: (p.windows || []).map((w) => ({ label: windowName(w.label), percent: w.percent, warn: w.percent >= 80 })),
      })));
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
    const sources = { bluetooth: "Bluetooth", logitech: "Logitech", headsetcontrol: via("HeadsetControl") };
    live(devices, deviceReading, 30000, (values) => {
      if (!Array.isArray(values) || !values.length) { devices.append(text("p", t("w.devicesNone"))); return; }
      cards(devices, values.map((d) => ({
        name: d.name, sub: sources[d.source] || "", glyph: { headset: "headphones", mouse: "mouse", keyboard: "device-keyboard", gamepad: "gamepad" }[d.kind] || "battery",
        bars: [{ label: t("w.battery"), percent: d.level, warn: d.level <= 20 }],
      })));
    });
  }
  if (item.widget === "system") {
    const native = section(t("w.system"));
    load(native, api.systemStats, (stats) => {
      if (!stats) { native.append(text("p", t("plugins.noData"))); return; }
      list(native, [["CPU", `${Math.round(stats.cpu || 0)}%`], ["RAM", `${Math.round(stats.mem || 0)}%`]]);
    });
  }
  const ids = item.widget === "devices" ? ["headsetcontrol"] : item.widget === "system" ? ["winget", "librehardwaremonitor", "openrgb", "rclone"] : item.widget === "media" ? ["yt-dlp"] : [];
  for (const id of ids) {
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
        button(controls, t(plugin.external ? "plugins.appInstaller" : "plugins.installForWidget"), async () => {
          if (plugin.external) { await api.launch("ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1", []); return; }
          await api.pluginInstall(id); await show();
        }); return;
      }
      controls.append(text("small", via(plugin.name)));
      if (["winget", "rclone", "librehardwaremonitor"].includes(id)) button(controls, t("plugins.refresh"), async () => {
        const result = await api.pluginRead(id);
        if (disposed) return;
        box.querySelector(".plugin-result")?.remove();
        const output = text("pre", formatPluginResult(id, result), "plugin-result"); output.tabIndex = 0; box.append(output);
      });
      if (["openrgb", "librehardwaremonitor"].includes(id)) button(controls, t(id === "librehardwaremonitor" ? "plugins.openAdmin" : "system.open"), () => api.pluginOpen(id));
      if (id === "openrgb") button(controls, t("plugins.profile"), async () => { const path = await pickRgbProfile(); if (path) await api.pluginOpen(id, path); });
      if (id === "yt-dlp") {
        const input = document.createElement("input"); input.type = "url"; input.placeholder = "https://"; input.setAttribute("aria-label", t("plugins.videoUrl")); input.value = item.url || ""; controls.append(input);
        button(controls, t("plugins.download"), async () => {
          const url = videoUrl(input.value); if (!url) throw new Error(t("plugins.videoUrl"));
          const folder = await pickFolder(); if (!folder || disposed) return;
          const progress = text("p", t("plugins.downloadBusy")); progress.setAttribute("role", "status"); controls.append(progress);
          try { await api.pluginDownload(url, folder); if (!disposed) progress.textContent = t("plugins.downloadDone"); }
          catch (error) { progress.remove(); throw error; }
        });
      }
    };
    show().catch((error) => { if (!disposed) { state.textContent = `${t("plugins.failed")} ${String(error)}`; button(controls, t("focus.retry"), show); } });
  }
  function volumeRow(container, name, percent, muted, save) {
    const row = document.createElement("div"); row.className = "app-volume-row";
    const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "100"; input.value = String(percent); input.setAttribute("aria-label", name);
    const value = text("output", `${percent}%`); input.addEventListener("input", () => { value.textContent = `${input.value}%`; });
    // Commit on release/keyboard change. Serialize volume and mute writes so
    // rapid input can never let an older request overwrite the newest one.
    let queue = Promise.resolve();
    const mute = document.createElement("input"); mute.type = "checkbox"; mute.checked = muted; mute.setAttribute("aria-label", `${name} · ${t("w.muted")}`);
    const commit = () => {
      const wanted = [Number(input.value), mute.checked];
      queue = queue.catch(() => {}).then(() => save(...wanted)).catch((error) => {
        if (!disposed) { row.querySelector(".plugin-action-error")?.remove(); const message = text("span", `${t("plugins.failed")} ${String(error)}`, "plugin-action-error"); message.setAttribute("role", "alert"); row.append(message); }
      });
    };
    input.addEventListener("change", commit); mute.addEventListener("change", commit);
    const muteLabel = text("span", t("w.muted"));
    row.append(text("span", name), input, value, muteLabel, mute); container.append(row);
  }
  return panel;
}
function via(name) { return t("w.devicesVia").replace("{plugin}", () => name); }
export function videoUrl(value) {
  try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function formatPluginResult(id, value) {
  if (id === "winget") return String(value || t("plugins.noData"));
  let data;
  try { data = typeof value === "string" ? JSON.parse(value) : value; } catch { return t("plugins.noData"); }
  if (id === "rclone") return `${data?.bytes ?? 0} B · ${Math.round(data?.speed ?? 0)} B/s · ${data?.transfers ?? 0} · ${data?.errors ?? 0} errors`;
  const rows = [];
  function visit(node, depth = 0) {
    if (!node || depth > 32 || rows.length >= 128) return;
    if (typeof node.Value === "string" && /°C|RPM/i.test(node.Value)) rows.push(`${node.Text}: ${node.Value}`);
    if (Array.isArray(node.Children)) for (const child of node.Children.slice(0, 256)) visit(child, depth + 1);
  }
  visit(data); return rows.join("\n") || t("plugins.noData");
}
