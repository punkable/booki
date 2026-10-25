import React, { useEffect, useRef, useState } from "react";
import { dock as dockApi } from "../api.js";
import { t } from "../i18n.js";
import { SYSTEM_METRICS, systemMetrics, metricLabel } from "../widgets-meta.js";
import { pluginsForWidget } from "../widget-integrations.js";
import PLUGINS from "../plugin-catalog.json";
import { CollectorSettings } from "./collector-settings.jsx";
import { notesOf } from "../notes-model.js";
import { InfoBar, Row, Select, Slider, Toggle, Icon } from "./ui.jsx";

function Action({ children, run }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  return <div className="widget-action"><button type="button" className="button" disabled={busy} onClick={async () => {
    setBusy(true); setError(false);
    try { await run(); } catch { setError(true); } finally { setBusy(false); }
  }}>{children}</button>{error && <InfoBar severity="error">{t("overhaul.failed")}</InfoBar>}</div>;
}

function WeatherLocation({ style, patch }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]), [state, setState] = useState("idle");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const search = async (event) => {
    event.preventDefault(); if (!query.trim()) return;
    const sequence = ++request.current; setState("loading"); setResults([]);
    try {
      const values = await dockApi.weatherSearch(query.trim());
      if (sequence !== request.current) return;
      setResults(Array.isArray(values) ? values : []); setState("done");
    } catch { if (sequence === request.current) setState("error"); }
  };
  return <div className="widget-location">
    <p>{style.city || t("focus.noCity")}</p>
    <form onSubmit={search}><label>{t("widgetFlow.city")}<input className="text-field" value={query} maxLength={160} onChange={(event) => { request.current++; setQuery(event.target.value); setState("idle"); setResults([]); }} /></label>
      <button type="submit" className="button" disabled={state === "loading" || !query.trim()}>{t("widgetFlow.search")}</button></form>
    {state === "loading" && <p role="status">{t("overhaul.loading")}</p>}
    {state === "error" && <InfoBar severity="error">{t("focus.weatherError")}</InfoBar>}
    {state === "done" && !results.length && <p role="status">{t("add.none")}</p>}
    <ul className="widget-location-results">{results.map((city, i) => <li key={`${city.latitude},${city.longitude},${i}`}><button type="button" className="button" onClick={() => {
      patch({ city: city.name, latitude: city.latitude, longitude: city.longitude }); setResults([]); setState("idle");
    }}>{[city.name, city.admin1, city.country].filter(Boolean).join(", ")}</button></li>)}</ul>
    {style.city && <button type="button" className="button" onClick={() => patch({ city: "", latitude: null, longitude: null })}>{t("widgetFlow.clearCity")}</button>}
  </div>;
}

function DeviceSelection({ style, patch }) {
  const [devices, setDevices] = useState([]), [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    dockApi.deviceBatteries().then((values) => { if (active) setDevices(Array.isArray(values) ? values : []); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const names = [...new Set([style.device, ...devices.map((device) => device.name)].filter(Boolean))];
  return <>
    <Row label={t("widgetFlow.device")}><Select value={style.device || ""} label={t("widgetFlow.device")} options={[{ value: "", label: t("widgetFlow.allDevices") }, ...names.map((name) => ({ value: name, label: name }))]} onChange={(value) => patch({ device: value || null, deviceKind: devices.find((device) => device.name === value)?.kind || null })} /></Row>
    {error && <p role="status">{t("plugins.noData")}</p>}
    {!style.device && <Toggle label={t("widgetFlow.rotate")} checked={style.rotate !== false} onChange={(rotate) => patch({ rotate })} />}
    <p className="inline-note">{t("refine.deviceNote")}</p>
  </>;
}

export function WidgetConnections({ widget }) {
  const ids = pluginsForWidget(widget).filter((id) => !PLUGINS.find((plugin) => plugin.id === id)?.companion);
  return <div className="widget-connections"><p>{t("widgetFlow.connectionsHint")}</p>
    {ids.map((id) => <p key={id}><strong>{PLUGINS.find((plugin) => plugin.id === id)?.name || id}</strong> — {t(`plugins.${id}.feeds`)}</p>)}
    <button type="button" className="button" onClick={() => dockApi.openSettingsTab("plugins")}><Icon name="settings" />{t("plugins.title")}</button>
  </div>;
}

export function WidgetContent({ item, cfg, set, patch }) {
  const style = item.style || {};
  const widget = item.widget;
  const openWindows = (path) => <Action run={() => dockApi.launch(path, [])}>{t("widgetFlow.windowsSettings")}</Action>;
  return <div className="widget-content-fields">
    {widget === "clock" && <>
      <Row label={t("widgetFlow.timeFormat")}><Select label={t("widgetFlow.timeFormat")} value={style.hourCycle || "system"} onChange={(value) => patch({ hourCycle: value })} options={[{ value: "system", label: t("overhaul.automatic") }, { value: "12", label: t("widgetFlow.hour12") }, { value: "24", label: t("widgetFlow.hour24") }]} /></Row>
      <Toggle label={t("widgetFlow.seconds")} checked={!!style.showSeconds} onChange={(showSeconds) => patch({ showSeconds })} />
      <Toggle label={t("widgetFlow.date")} checked={style.showDate !== false} onChange={(showDate) => patch({ showDate })} />
    </>}
    {["clock", "calendar"].includes(widget) && <Row label={t("widgetFlow.weekStart")}><Select label={t("widgetFlow.weekStart")} value={style.weekStart == null ? "system" : String(style.weekStart)} onChange={(value) => patch({ weekStart: value === "system" ? null : Number(value) })} options={[{ value: "system", label: t("overhaul.automatic") }, { value: "1", label: t("widgetFlow.monday") }, { value: "0", label: t("widgetFlow.sunday") }]} /></Row>}
    {widget === "weather" && <><WeatherLocation style={style} patch={patch} /><Row label={t("weather.units")}><Select label={t("weather.units")} value={style.units || "celsius"} onChange={(units) => patch({ units })} options={[{ value: "celsius", label: t("premium.celsius") }, { value: "fahrenheit", label: t("premium.fahrenheit") }]} /></Row></>}
    {widget === "system" && <Row label={t("widgets.metrics")} hint={t("widgets.metricsHint")} stack><div className="chips" role="group" aria-label={t("widgets.metrics")}>
      {SYSTEM_METRICS.map((metric) => { const chosen = systemMetrics(style); return <button key={metric} type="button" className="chip" aria-pressed={chosen.includes(metric)} disabled={chosen.length === 1 && chosen.includes(metric)} onClick={() => patch({ metrics: SYSTEM_METRICS.filter((value) => value === metric ? !chosen.includes(value) : chosen.includes(value)) })}>{metricLabel(metric, t)}</button>; })}
    </div></Row>}
    {widget === "devices" && <DeviceSelection style={style} patch={patch} />}
    {["media", "battery", "devices", "ai"].includes(widget) && <Toggle label={t("overhaul.relevant")} hint={t("overhaul.relevantHint")} checked={!!style.hideWhenUnavailable} onChange={(hideWhenUnavailable) => patch({ hideWhenUnavailable })} />}
    {widget === "ai" && <>
      <Row label={t("widgetFlow.provider")}><Select label={t("widgetFlow.provider")} value={style.provider || "auto"} onChange={(value) => patch({ provider: value === "auto" ? null : value })} options={[{ value: "auto", label: t("widgetFlow.allProviders") }, ...["claude", "codex", "cursor", "opencode"].map((value) => ({ value, label: { claude: "Claude", codex: "Codex", chatgpt: "ChatGPT", cursor: "Cursor", opencode: "OpenCode" }[value] }))]} /></Row>
      {!style.provider && <Toggle label={t("widgetFlow.rotate")} checked={style.rotate !== false} onChange={(rotate) => patch({ rotate })} />}
      <p className="inline-note"><Icon name="lock" />{t("widget.aiPrivacy")}</p><details className="inline-details"><summary>{t("panelFlow.aiDetection")}</summary><p className="inline-note">{t("panelFlow.aiSources")}</p></details>
      <Toggle label={t("be.notchAgents")} hint={t("widgetFlow.sharedNotch")} checked={cfg.notchAgents !== false} onChange={(notchAgents) => set({ notchAgents })} />
      <AgentBridge />
    </>}
    {widget === "media" && <Toggle label={t("w.mediaScrollVolume")} hint={t("w.mediaScrollVolumeHint")} checked={!!style.scrollVolume} onChange={(scrollVolume) => patch({ scrollVolume })} />}
    {widget === "volume" && <Row label={t("widgetFlow.volumeStep")} stack><Slider value={style.volumeStep || 3} min={1} max={10} step={1} fmt={(value) => `${value}%`} onChange={(volumeStep) => patch({ volumeStep })} /></Row>}
    {widget === "notes" && <p className="inline-note">{t("notes.where").replace("{n}", () => notesOf(style).length)}</p>}
    {widget === "focus" && <>
      <Row label={t("widgetFlow.duration")} hint={style.endsAt ? t("widgetFlow.runningDuration") : undefined} stack><Slider value={Number(style.minutes) || 25} min={1} max={180} step={1} fmt={(value) => `${value} min`} onChange={(minutes) => patch(style.endsAt ? { minutes } : { minutes, remaining: null })} /></Row>
      <Toggle label={t("focus.dnd")} hint={t("focus.dndHint")} checked={style.dnd === true} onChange={(dnd) => patch({ dnd })} />
      <Toggle label={t("focus.tuck")} hint={t("focus.tuckHint")} checked={!!style.tuckDuringFocus} onChange={(tuckDuringFocus) => patch({ tuckDuringFocus })} />
    </>}
    {widget === "clipboard" && <><p className="inline-note">{t("widgetFlow.sharedSettings")}</p><ClipboardPolicy cfg={cfg} set={set} /></>}
    {widget === "collector" && <><p className="inline-note">{t("widgetFlow.sharedSettings")}</p><CollectorSettings cfg={cfg} set={set} /></>}
    {widget === "updates" && <><p>{t("widget.updatesDesc")}</p><Row label={t("widgetFlow.ignoredUpdates")} hint={String((cfg.ignoredUpdates || []).length)}><button type="button" className="button" disabled={!cfg.ignoredUpdates?.length} onClick={() => set({ ignoredUpdates: [] })}>{t("widgetFlow.restoreUpdates")}</button></Row></>}
    {widget === "lighting" && <><p>{t("widget.lightingDesc")}</p><Action run={() => dockApi.pluginOpen("openrgb")}>{t("widgetFlow.manageLighting")}</Action></>}
    {["wifi", "bluetooth", "winsettings"].includes(widget) && <p>{t(`widget.${widget}Desc`)}</p>}
    {widget === "wifi" && openWindows("ms-settings:network-wifi")}
    {widget === "bluetooth" && openWindows("ms-settings:bluetooth")}
    {widget === "winsettings" && openWindows("ms-settings:")}
    {widget === "battery" && openWindows("ms-settings:batterysaver")}
    {["volume", "media"].includes(widget) && openWindows("ms-settings:sound")}
    {widget === "calendar" && openWindows("ms-settings:dateandtime")}
  </div>;
}
/** Clipboard history policy. Lives with the clipboard widget. */
/** Opt-in: Claude Code reports its real plan usage through its status line,
 *  and each agent its exact state through its hooks. Local only; nothing is
 *  read from any account and nothing goes over the network. */
const AGENT_NAMES = { claude: "Claude Code", codex: "Codex", gemini: "Gemini CLI", cursor: "Cursor" };
function AgentBridge() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { dockApi.agentBridgeStatus?.().then(setStatus).catch(() => setStatus(null)); }, []);
  const agents = (status?.agents || []).filter((agent) => agent.available);
  if (!agents.length) return null;
  const run = async (action) => {
    if (busy) return;
    setBusy(true); setError("");
    try { setStatus(await action()); }
    catch (e) { setError(String(e?.message || e || t("overhaul.failed"))); }
    finally { setBusy(false); }
  };
  const claude = agents.some((agent) => agent.id === "claude");
  return <>
    {claude && <Toggle label={t("claude.realUsage")} hint={t("claude.realUsageHint")} checked={status.statusline} onChange={(on) => run(() => dockApi.agentStatuslineSet(on))} />}
    {claude && status.statusline && <p className="inline-note" role="status">{!status.statusline_seen ? t("claude.notSeen")
      : status.statusline_limits ? t("claude.seenLimits").replace("{time}", () => new Date(status.statusline_seen * 1000).toLocaleTimeString())
      : t("claude.seenNoLimits")}</p>}
    <p className="inline-note">{t("claude.exactStatesHint")}</p>
    {agents.map((agent) => <Toggle key={agent.id} label={t("agents.exactStates").replace("{agent}", () => AGENT_NAMES[agent.id] || agent.id)} hint={agent.id === "codex" ? t("agents.codexTrust") : undefined} checked={agent.hooks} onChange={(on) => run(() => dockApi.agentHooksSet(agent.id, on))} />)}
    {error && <InfoBar severity="error">{error}</InfoBar>}
  </>;
}

export function ClipboardPolicy({ cfg, set }) {
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => dockApi.clipboardStorageFailed().then((failed) => { if (active) setStorageFailed(!!failed); }).catch(() => {});
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [cfg.clipboardPersist]);
  return <>
    {storageFailed && <InfoBar severity="error">{t("clip.storageFailed")}</InfoBar>}
    <Toggle label={t("clip.memory")} hint={t("clip.memoryHint")} checked={!!cfg.clipboardPersist} onChange={(v) => set({ clipboardPersist: v })} />
    <Toggle label={t("clip.sensitive")} hint={t("clip.sensitiveHint")} checked={cfg.clipboardSensitiveGuard !== false} onChange={(v) => set({ clipboardSensitiveGuard: v })} />
    <Toggle label={t("clip.compact")} hint={t("clip.compactHint")} checked={!!cfg.clipboardCompact} onChange={(v) => set({ clipboardCompact: v })} />
    <Row label={t("clip.retention")} hint={t("clip.retentionHint")} stack>
      <Slider value={cfg.clipboardRetentionDays ?? 7} min={1} max={90} step={1} fmt={(v) => t("clip.days").replace("{n}", v)} onChange={(v) => set({ clipboardRetentionDays: v })} />
    </Row>
    <Row label={t("clip.limit")} hint={t("clip.limitHint")} stack>
      <Slider value={cfg.clipboardHistoryLimit ?? 60} min={10} max={200} step={10} fmt={(v) => t("clip.items").replace("{n}", v)} onChange={(v) => set({ clipboardHistoryLimit: v })} />
    </Row>
    <Row label={t("clip.clear")}><button type="button" className="button" onClick={() => dockApi.clipboardClear()}>{t("clip.clear")}</button></Row>
  </>;
}

