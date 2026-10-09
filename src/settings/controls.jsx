/* Controls shared by the Settings pages. Native elements, styled in
   src/styles/settings.css; no component library. */
import React from "react";
import { dock as dockApi } from "../api.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { SURFACE_TINT_PRESETS } from "../surface.js";
import { LAYOUT_SCENARIOS } from "../dock/layout-model.js";
import { Icon, SegmentedControl } from "./ui.jsx";

export const ACCENTS = [
  ["ac.tan", "#dfaa75"],
  ["ac.amber", "#ffbe0b"],
  ["ac.orange", "#fb5607"],
  ["ac.pink", "#ff006e"],
  ["ac.violet", "#8338ec"],
  ["ac.blue", "#3a86ff"],
  ["ac.green", "#2ecc71"],
];

export const LANG_OPTIONS = [
  { value: "system", key: "lang.system" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

/** A row of colour swatches plus a custom colour well. */
function Swatches({ value, presets, onChange, label, children }) {
  const current = (value || "").toLowerCase();
  const isPreset = presets.some(([, hex]) => hex.toLowerCase() === current);
  return <div className="swatches" role="group" aria-label={label}>
    {presets.map(([name, hex]) => <button key={hex} type="button" className="swatch" style={{ "--sw": hex }}
      aria-label={name} title={name} aria-pressed={current === hex.toLowerCase()} onClick={() => onChange(hex)} />)}
    <label className="swatch swatch-custom" title={t("ap.custom")} data-active={!!current && !isPreset || undefined}
      style={{ "--sw": current && !isPreset ? current : "transparent" }}>
      <input type="color" aria-label={t("ap.custom")} value={/^#[0-9a-f]{6}$/.test(current) ? current : "#808080"} onChange={(e) => onChange(e.target.value)} />
      <Icon name="plus" />
    </label>
    {children}
  </div>;
}

export function AccentPicker({ value, onChange }) {
  const from = (source) => async () => {
    const hex = await source().catch(() => null);
    if (hex) onChange(hex);
  };
  return <Swatches value={value} label={t("ap.accent")} presets={ACCENTS.map(([key, hex]) => [t(key), hex])} onChange={onChange}>
    <button type="button" className="chip" onClick={from(dockApi.systemAccent)}>{t("ap.systemShort")}</button>
    <button type="button" className="chip" onClick={from(dockApi.wallpaperAccent)}><Icon name="image" />{t("ap.wallpaperShort")}</button>
  </Swatches>;
}

/** Glass colour. Empty means "follow the theme". */
export function TintPicker({ value, onChange }) {
  return <Swatches value={value} label={t("ap.surfaceTint")} presets={SURFACE_TINT_PRESETS.map(([id, hex]) => [t(`tint.${id}`), hex])} onChange={onChange}>
    <button type="button" className="chip" aria-pressed={!value} onClick={() => onChange("")}>{t("ap.surfaceTintAuto")}</button>
  </Swatches>;
}

/** The three ways the dock can behave; each is a small patch. */
export function ScenarioPicker({ cfg, set }) {
  const current = cfg.autoHideMode || "smart";
  return <div className="choice-grid" role="radiogroup" aria-label={t("overhaul.scenarios")}>
    {LAYOUT_SCENARIOS.map((scenario) => <button type="button" role="radio" key={scenario.id} className="choice-card"
      aria-checked={current === scenario.id} onClick={() => set(scenario.patch)}>
      <span className="choice-icon" dangerouslySetInnerHTML={{ __html: icon(scenario.icon) }} />
      <span className="choice-name">{t(scenario.title)}</span>
      <span className="choice-hint">{t(scenario.hint)}</span>
    </button>)}
  </div>;
}

/** Edge and alignment, with a tiny screen showing where the bar goes. */
export function PositionPicker({ cfg, set, afterPlacement }) {
  const edge = cfg.edge || "bottom";
  const slot = cfg.notchPosition || "center";
  return <div className="position-picker">
    <div className="screen-mock" aria-hidden="true"><span className={`screen-bar at-${edge} slot-${slot}`} /></div>
    <div className="position-fields">
      <SegmentedControl label={t("be.position")} value={edge} onChange={(value) => set({ edge: value }, afterPlacement)}
        options={["top", "bottom", "left", "right"].map((value) => ({ value, label: t(`edge.${value}`) }))} />
      <SegmentedControl label={t("design.alignment")} value={slot} onChange={(value) => set({ notchPosition: value }, afterPlacement)}
        options={["start", "center", "end"].map((value) => ({ value, label: t(`be.notch${value[0].toUpperCase()}${value.slice(1)}`) }))} />
    </div>
  </div>;
}

/** Pick a monitor from boxes scaled to their real geometry. */
export function MonitorPicker({ value, monitors, onChange }) {
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const width = Math.max(...monitors.map((m) => m.x + m.w)) - minX || 1;
  const height = Math.max(...monitors.map((m) => m.y + m.h)) - minY || 1;
  const scale = Math.min(200 / width, 84 / height);
  return <div className="monitor-picker">
    <button type="button" className="chip" aria-pressed={value === -1} onClick={() => onChange(-1)}>{t("mon.auto")}</button>
    <div className="monitor-stage" style={{ width: width * scale, height: height * scale }}>
      {monitors.map((m) => <button key={m.index} type="button" className="monitor-box" aria-pressed={value === m.index} title={m.name}
        aria-label={`${t("be.monitor")} ${m.index + 1}${m.primary ? ` · ${t("mon.primary")}` : ""}`}
        style={{ left: (m.x - minX) * scale + 2, top: (m.y - minY) * scale + 2, width: m.w * scale - 4, height: m.h * scale - 4 }}
        onClick={() => onChange(m.index)}>{m.index + 1}</button>)}
    </div>
  </div>;
}

/** Records a shortcut with at least one modifier. */
export function HotkeyInput({ value, onChange }) {
  const capture = (e) => {
    if (e.key === "Tab") return;
    e.preventDefault();
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key) || !mods.length) return;
    const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    onChange([...mods, key].join("+"));
  };
  return <div className="hotkey">
    <input readOnly aria-label={t("sc.toggle")} value={value || ""} placeholder={t("sc.press")} onKeyDown={capture} />
    {value && <button type="button" className="button" onClick={() => onChange("")}>{t("sc.clear")}</button>}
  </div>;
}

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Super"];
export function ModifierPicker({ cfg, set }) {
  const current = (cfg.hotkeyModifier || "Alt").split("+");
  const toggle = (key) => {
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    const ordered = MODIFIERS.filter((k) => (next.length ? next : ["Alt"]).includes(k)).join("+");
    set({ hotkeyModifier: ordered });
    dockApi.applyHotkeys(cfg.hotkey || "", cfg.positionHotkeys !== false, ordered);
  };
  return <div className="chips" role="group" aria-label={t("sc.posMod")}>
    {MODIFIERS.map((key) => <button key={key} type="button" className="chip" aria-pressed={current.includes(key)} onClick={() => toggle(key)}>{key === "Super" ? "Win" : key}</button>)}
  </div>;
}
