/* Native widget details and optional providers. Every async result belongs to
   this panel instance; closing it prevents late results from repainting it. */
import { dock as api, pickRgbProfile } from "../api.js";
import { t, curLang } from "../i18n.js";
import { icon } from "../icons.js";
import PLUGINS from "../plugin-catalog.json";
import { systemMetrics, metricLabel, WIDGET_GLYPHS } from "../widgets-meta.js";
import { fmtRate } from "./widget-view.js";
import { pluginError } from "../plugin-errors.js";
import { S } from "./state.js";
import { persist } from "./config-sync.js";
import { addWidget } from "./pin-ops.js";
import { buildCollectorPanel } from "./collector-panel.js";
import { deviceReading, aiReading, statsReading, tokenText, updatesReading, shownUpdates, matchDevice, batteryTone, usageTone } from "./readings.js";
import { refreshUpdates, refreshDevices, paintLighting, refreshConnectivity } from "./live-widgets.js";
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
  const heading = document.createElement("div"); heading.className = "widget-panel-title";
  const headingIcon = text("span", "", "widget-panel-icon"); headingIcon.innerHTML = icon(WIDGET_GLYPHS[item.widget] || "sparkles");
  heading.append(headingIcon, text("strong", t(`w.${item.widget}`))); head.append(heading, done); panel.append(head);
  const body = document.createElement("div"); body.className = "system-widget-sections"; panel.append(body);
  // Panel-wide actions live in the header as icons, beside settings and close.
  const headAction = (glyph, label, action) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "stack-close panel-head-action";
    b.innerHTML = icon(glyph); b.title = label; b.setAttribute("aria-label", label);
    b.addEventListener("click", async () => {
      b.disabled = true; b.classList.add("is-busy");
      try { await action(); } catch (_) { b.classList.add("has-error"); setTimeout(() => b.classList.remove("has-error"), 1600); }
      finally { if (!disposed) { b.disabled = false; b.classList.remove("is-busy"); } }
    });
    head.insertBefore(b, done); return b;
  };
  const stamp = (reading) => {
    const at = reading.checkedAt; if (!at) return null;
    const time = new Date(at).toLocaleTimeString(curLang(), { hour: "2-digit", minute: "2-digit" });
    return text("p", t("panelFlow.checkedAgo").replace("{time}", () => time), "panel-stamp");
  };
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
  const reads = new WeakMap();
  const load = async (container, action, paint) => {
    const request = Symbol(); reads.set(container, request);
    // A skeleton of two cards shimmers while it loads; the text is for screen readers.
    const loading = text("p", t("overhaul.loading"), "skeleton-cards"); loading.setAttribute("role", "status");
    loading.insertAdjacentHTML("beforeend", '<i aria-hidden="true"></i><i aria-hidden="true"></i>'); container.append(loading);
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
      // A card's own action is an icon beside its value, named on hover.
      if (row.action) {
        const act = document.createElement("button"); act.type = "button"; act.className = "reading-card-action";
        act.innerHTML = icon(row.action.glyph); act.title = row.action.label; act.setAttribute("aria-label", `${row.action.label}: ${row.name}`);
        act.addEventListener("click", async () => { act.disabled = true; try { if (await row.action.run()) act.remove(); } catch (_) { act.classList.add("has-error"); } finally { act.disabled = false; } });
        top.append(act);
      }
      card.append(top);
      for (const bar of row.bars || []) {
        const line = document.createElement("div"); line.className = "reading-bar";
        if (bar.label) line.append(text("span", bar.label), text("span", `${Math.round(bar.percent)}%`, "reading-bar-value"));
        const track = document.createElement("div"); track.className = "reading-bar-track";
        track.setAttribute("role", "meter"); track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(Math.round(bar.percent))); track.setAttribute("aria-label", `${row.name} ${bar.label || t("w.battery")}`);
        const fill = document.createElement("i"); fill.style.transform = `scaleX(${Math.max(0, Math.min(100, bar.percent)) / 100})`;
        if (bar.tone) fill.dataset.tone = bar.tone;
        track.append(fill); line.append(track); card.append(line);
      }
      if (row.meta) card.append(text("small", row.meta, "reading-card-meta"));
      grid.append(card);
    }
    container.append(grid);
  };
  if (item.widget === "media") {
    const transport = section(t("w.media"));
    // Now playing first, then one centered transport row.
    const now = document.createElement("div"); now.className = "media-now"; transport.append(now);
    load(now, api.mediaInfo, (media) => {
      if (!media?.title) { now.append(text("p", t("w.mediaIdle"))); return; }
      now.append(text("strong", media.title)); if (media.artist) now.append(text("small", media.artist));
    });
    const controls = document.createElement("div"); controls.className = "media-transport"; transport.append(controls);
    for (const [glyph, action] of [["chevron-left", api.mediaPrev], ["play", api.mediaToggle], ["chevron-right", api.mediaNext]]) {
      const control = button(controls, "", action); control.innerHTML = icon(glyph); control.setAttribute("aria-label", t(`w.${glyph === "play" ? "playPause" : glyph === "chevron-left" ? "prev" : "next"}`));
      if (glyph === "play") control.classList.add("media-play");
    }
  }
  if (item.widget === "battery") {
    const battery = section(t("w.battery"));
    live(battery, statsReading, 2500, (stats) => {
      if (!(stats?.battery >= 0)) { battery.append(text("p", t("plugins.noData"))); return; }
      cards(battery, [{ name: t(stats.charging ? "dev.charging" : "panelFlow.onBattery"), glyph: "battery", value: `${stats.battery}%`, bars: [{ label: "", percent: stats.battery, tone: batteryTone(stats.battery, !!stats.charging) }] }]);
    });
  }
  if (item.widget === "ai") {
    const ai = section(t("w.ai"));
    const icons = { claude: "ai-claude", chatgpt: "ai-openai", codex: "ai-openai", cursor: "ai-cursor", opencode: "ai-opencode" };
    const windowName = (label) => (label === "week" ? t("w.aiWeek") : label);
    const clock = (s) => (s > 0 ? new Date(s * 1000).toLocaleString(curLang(), { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");
    const withReset = (label, s) => { const r = clock(s); return r ? `${label} · ${t("w.aiResets").replace("{time}", () => r)}` : label; };
    const tokens = (n) => t("w.aiTokens").replace("{n}", () => tokenText(n));
    live(ai, aiReading, 60000, (providers) => {
      const all = (Array.isArray(providers) ? providers : []).filter((provider) => !item.style?.provider || provider.id === item.style.provider);
      if (!all.length) { ai.append(text("p", t("w.aiNone"))); return; }
      // Providers with no local data share one quiet line instead of a card each.
      const found = all.filter((p) => p.detected !== false), missing = all.filter((p) => p.detected === false);
      const notFound = () => { if (missing.length) ai.append(text("p", t("panelFlow.notFound").replace("{names}", () => missing.map((p) => p.name).join(", ")), "ai-missing")); };
      if (!found.length) { notFound(); return; }
      const recorded = found.filter((p) => !(p.windows || []).length && (p.block || p.week_tokens > 0));
      cards(ai, found.map((p) => {
        const windows = p.windows || [];
        const sub = t("w.aiWeekTokens").replace("{n}", () => tokens(p.week_tokens));
        if (windows.length) {
          return {
            name: p.name, glyph: icons[p.id] || "sparkles", sub, value: `${Math.round(100 - Math.max(...windows.map((window) => window.percent)))}% ${t("w.aiRemaining")}`,
            tone: usageTone(Math.max(0, ...windows.map((w) => w.percent))),
            bars: windows.map((w) => ({ label: withReset(`${windowName(w.label)} · ${t("panelFlow.used")}`, w.resets_at), percent: w.percent, tone: usageTone(w.percent) })),
          };
        }
        // Local consumption never masquerades as a subscription allowance.
        if (p.block) return { name: p.name, glyph: icons[p.id] || "sparkles", sub: withReset(sub, p.block.resets_at), value: `~${tokens(p.block.tokens)}`, bars: [] };
        if (p.week_tokens > 0) return { name: p.name, glyph: icons[p.id] || "sparkles", sub, bars: [] };
        return { name: p.name, glyph: icons[p.id] || "sparkles", sub: t("panelFlow.presenceOnly"), bars: [] };
      }));
      // Said once, under the cards it applies to.
      if (recorded.length) ai.append(text("p", t("w.aiQuotaUnknown"), "ai-quota-note"));
      notFound();

    });
  }
  if (item.widget === "ai") {
    headAction("refresh", t("plugins.refresh"), () => aiReading.refresh());
    const guide = document.createElement("details"); guide.className = "widget-diagnostics";
    guide.append(text("summary", t("panelFlow.aiDetection")), text("p", t("panelFlow.aiSources")), text("p", t("w.aiLocal"))); body.append(guide);
  }
  if (item.widget === "volume") {
    const master = section(t("w.volume"));
    load(master, api.volumeInfo, (value) => {
      if (!Array.isArray(value)) { master.append(text("p", t("plugins.noData"))); return; }
      volumeRow(master, t("w.volume"), value[0], value[1], (percent, muted) => api.masterVolumeSet(percent, muted), "");
    });
    const apps = section(t("plugins.audioApps"));
    const sessionList = document.createElement("div"); apps.append(sessionList);
    const refresh = () => {
      sessionList.replaceChildren();
      return load(sessionList, api.appVolumes, (sessions) => {
        if (!Array.isArray(sessions) || !sessions.length) { sessionList.append(text("p", t("plugins.noSessions"))); return; }
        // An app can own several sessions (Discord's voice and its sounds):
        // number them so two rows with one name are not a mystery.
        const counts = {}; for (const s of sessions) counts[s.name] = (counts[s.name] || 0) + 1;
        const seen = {};
        for (const session of sessions) {
          seen[session.name] = (seen[session.name] || 0) + 1;
          const label = counts[session.name] > 1 ? `${session.name} ${seen[session.name]}` : session.name;
          volumeRow(sessionList, label, session.percent, session.muted, (percent, muted) => api.appVolumeSet(session.id, percent, muted), session.path ?? null);
        }
      });
    };
    headAction("refresh", t("plugins.refresh"), refresh);
    refresh();
  }
  const sourceName = (source) => ({ bluetooth: "Bluetooth", headsetcontrol: "HeadsetControl", logitech: "Logitech HID++", hidpp: "Logitech HID++", xinput: "Xbox" })[source] || source || t("panelFlow.deviceReady");
  if (item.widget === "devices") {
    const devices = section(t("w.devices"));
    headAction("bluetooth", t("dev.bluetoothSettings"), () => api.launch("ms-settings:bluetooth", []));
    headAction("refresh", t("plugins.refresh"), refreshDevices);
    live(devices, deviceReading, 30000, (values) => {
      if (!Array.isArray(values) || !values.length) {
        // Nothing found: the one useful next step is pairing, so offer it here.
        devices.append(text("p", t("w.devicesNone")));
        button(devices, t("dev.bluetoothSettings"), () => api.launch("ms-settings:bluetooth", []));
        return;
      }
      const own = item.style?.device;
      const shown = own ? [matchDevice(values, own, item.style?.deviceKind)].filter(Boolean) : values;
      if (!shown.length) { devices.append(text("p", t("w.devicesNone"))); return; }
      const pinnedDevices = new Set(allWidgetPins("devices").map((p) => p.style?.device).filter(Boolean));
      cards(devices, shown.map((d) => ({
        // One line under the name: what needs attention, else where it reads from.
        name: d.name, sub: d.charging ? t("dev.charging") : d.level <= 20 ? t("dev.low") : sourceName(d.source), tone: batteryTone(d.level, d.charging), glyph: { headset: "headphones", mouse: "mouse", keyboard: "device-keyboard", gamepad: "gamepad" }[d.kind] || "battery",
        value: `${d.level}%`, bars: [{ label: "", percent: d.level, tone: batteryTone(d.level, d.charging) }],
        // Each device can have its own card on the dock, beside this one.
        action: own || pinnedDevices.has(d.name) ? null : { glyph: "plus", label: t("dev.ownCard"), run: async () => {
          if (!(await addWidget("devices", { style: { device: d.name, deviceKind: d.kind }, after: item.id }))) throw new Error(t("status.saveError"));
          return true;
        } },
      })));
      // One honest note for the whole list, on the timestamp, not per card.
      const deviceStamp = stamp(deviceReading); if (deviceStamp) { deviceStamp.title = t("refine.deviceNote"); devices.append(deviceStamp); }
    });
  }
  if (item.widget === "system") {
    const native = section(t("w.system"));
    live(native, statsReading, 2500, (stats) => {
      if (!stats) { native.append(text("p", t("plugins.noData"))); return; }
      const values = { cpu: stats.cpu, ram: stats.mem, disk: stats.disk };
      // Same cards as the other panels: a meter per load, the rates as text.
      const glyphs = { cpu: "cpu", ram: "memory", disk: "disk", net: "download" };
      cards(native, systemMetrics(item.style).map((metric) => metric === "net"
        ? { name: metricLabel(metric, t), glyph: glyphs.net, value: `↓ ${fmtRate(stats.net_down_kbps || 0)} · ↑ ${fmtRate(stats.net_up_kbps || 0)}`, bars: [] }
        : { name: metricLabel(metric, t), glyph: glyphs[metric], value: `${Math.round(values[metric] || 0)}%`, tone: usageTone(values[metric] || 0), bars: [{ label: "", percent: values[metric] || 0, tone: usageTone(values[metric] || 0) }] }));
    });
  }
  if (["system", "battery"].includes(item.widget)) {
    const timer = setInterval(() => { if (!disposed && !document.hidden) statsReading.fresh(2000).catch(() => {}); }, 5000);
    unsubscribe.push(() => clearInterval(timer));
  }
  if (item.widget === "collector") {
    buildCollectorPanel(item, { box: section(t("w.collector")), button, installButton, isDisposed: () => disposed, onDispose: (off) => unsubscribe.push(off) });
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
      if (!Array.isArray(list)) {
        box.append(text("p", t("perr.appInstaller")));
        button(box, t("plugins.appInstaller"), () => api.launch("ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1", []));
        return;
      }
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
  if (item.widget === "wifi") {
    const now = section(t("w.wifi"));
    load(now, api.wifiStatus, (w) => {
      const line = !w?.adapter ? t("conn.noAdapter") : w.connected ? `${w.ssid} · ${w.signal}%` : t("conn.offline");
      now.append(text("p", line, "conn-current"));
    });
    const near = section(t("conn.nearby"));
    load(near, api.wifiNetworks, (list) => {
      if (!list?.length) { near.append(text("p", t("conn.noneNearby"))); return; }
      const rows = document.createElement("div"); rows.className = "conn-list";
      for (const n of list) {
        const row = document.createElement("div"); row.className = "conn-row";
        const glyph = text("span", "", "conn-glyph"); glyph.innerHTML = icon("wifi"); glyph.style.opacity = String(0.35 + (n.signal / 100) * 0.65);
        row.append(glyph, text("span", n.ssid, "conn-name"), text("span", `${n.signal}%`, "conn-level"));
        rows.append(row);
      }
      near.append(rows);
    });
    // Booki never joins a network itself: Windows' own list does that.
    const wifiActions = document.createElement("div"); wifiActions.className = "conn-actions"; body.append(wifiActions);
    button(wifiActions, t("conn.connect"), () => api.launch("ms-availablenetworks:", []));
    button(wifiActions, t("conn.wifiSettings"), () => api.launch("ms-settings:network-wifi", []));
  }
  if (item.widget === "bluetooth") {
    const box = section(t("w.bluetooth"));
    const paint = (on) => {
      box.querySelectorAll(".conn-switch").forEach((el) => el.remove());
      if (on == null) { box.prepend(text("p", t("conn.noAdapter"), "conn-switch")); return; }
      const row = document.createElement("label"); row.className = "conn-switch";
      const input = document.createElement("input"); input.type = "checkbox"; input.className = "conn-toggle"; input.setAttribute("role", "switch"); input.setAttribute("aria-label", t("w.bluetooth")); input.checked = on;
      input.addEventListener("change", async () => {
        input.disabled = true;
        const now = await api.bluetoothSet(input.checked).catch(() => null);
        if (disposed) return;
        input.disabled = false; input.checked = now === true;
        refreshConnectivity();
      });
      row.append(text("span", t("w.bluetooth")), input);
      box.prepend(row);
    };
    load(box, api.bluetoothState, paint);
    button(box, t("conn.btSettings"), () => api.launch("ms-settings:bluetooth", []));
    button(box, t("conn.btAdd"), () => api.launch("ms-settings:connecteddevices", []));
  }
  if (item.widget === "winsettings") {
    const box = section(t("w.winsettings"));
    const grid = document.createElement("div"); grid.className = "conn-shortcuts";
    const pages = [["settings", "conn.page.home", "ms-settings:"], ["wifi", "conn.page.network", "ms-settings:network"], ["bluetooth", "conn.page.devices", "ms-settings:bluetooth"],
      ["sun", "conn.page.display", "ms-settings:display"], ["volume", "conn.page.sound", "ms-settings:sound"], ["palette", "conn.page.personalize", "ms-settings:personalization"],
      ["app", "conn.page.apps", "ms-settings:appsfeatures"], ["battery", "conn.page.power", "ms-settings:powersleep"], ["refresh", "conn.page.update", "ms-settings:windowsupdate"]];
    for (const [glyph, label, uri] of pages) {
      const b = document.createElement("button"); b.type = "button"; b.className = "conn-shortcut";
      b.innerHTML = icon(glyph); b.append(text("span", t(label)));
      b.addEventListener("click", () => { api.launch(uri, []).catch(() => {}); close(); });
      grid.append(b);
    }
    box.append(grid);
  }
  const ids = item.widget === "devices" ? ["headsetcontrol"] : item.widget === "system" ? ["librehardwaremonitor"] : [];
  // Devices: support for USB headsets is a one-line offer while it is off,
  // and invisible once it is on. No plugin name, no description.
  if (item.widget === "devices") {
    const offer = document.createElement("details"); offer.className = "device-offer sensor-offer";
    api.pluginStatus("headsetcontrol").then((status) => {
      if (disposed || status?.installed) return;
      const summary = document.createElement("summary"); summary.innerHTML = icon("headphones"); summary.append(text("span", t("dev.missingHeadset")));
      offer.append(summary);
      installButton(offer, t("dev.enable"), "headsetcontrol", () => { offer.remove(); deviceReading.refresh().catch(() => {}); });
      body.append(offer);
    }).catch(() => {});
  }
  for (const id of ids.filter((id) => id !== "headsetcontrol")) {
    const plugin = PLUGINS.find((p) => p.id === id);
    const box = section(plugin.name);
    // Says what it adds instead of a vague "Connections": a sensor offer that
    // opens into its explanation and install button.
    const details = document.createElement("details"); details.className = "widget-provider-details sensor-offer";
    const summary = document.createElement("summary"); summary.innerHTML = icon("thermometer"); summary.append(text("span", t("panelFlow.sensors")));
    details.append(summary, box); body.append(details);
    box.append(text("p", t(`plugins.${id}.desc`)));
    if (id === "librehardwaremonitor") box.append(text("p", t("plugins.sensorWarning"), "plugin-warning"));
    const controls = document.createElement("div"); controls.className = "plugin-panel-actions"; box.append(controls);
    const state = text("span", t("overhaul.loading")); controls.append(state);
    const show = async () => {
      const status = await api.pluginStatus(id);
      if (disposed) return;
      controls.replaceChildren();
      // Once installed it is a normal part of the panel, not a hidden offer.
      if (status?.installed) { details.open = true; summary.hidden = true; }
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
  function volumeRow(container, name, percent, muted, save, path) {
    const row = document.createElement("div"); row.className = "app-volume-row";
    // Like the Windows mixer: the app's own icon; the speaker for the master
    // volume and for Windows' system sounds.
    const art = document.createElement("span"); art.className = "app-volume-icon"; art.setAttribute("aria-hidden", "true");
    art.innerHTML = icon(path === "" ? "volume" : "app");
    if (path) api.appIcon(path).then((src) => { if (src && !disposed) { const img = document.createElement("img"); img.alt = ""; img.src = src; art.replaceChildren(img); } }).catch(() => {});
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
    row.append(art, text("span", name, "app-volume-name"), input, value, mute); container.append(row);
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
