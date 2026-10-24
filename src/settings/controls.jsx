/* Controls shared by the Settings pages. Native elements, styled in
   src/styles/settings.css; no component library. */
import React, { useEffect, useState } from "react";
import { dock as dockApi } from "../api.js";
import { t, curLang } from "../i18n.js";
import { formatHotkey, keyLabel } from "./hotkey-labels.js";
import { icon } from "../icons.js";
import { SURFACE_TINT_PRESETS } from "../surface.js";
import { LAYOUT_SCENARIOS } from "../dock/layout-model.js";
import { ACCENT_PALETTE, paletteEntry } from "../palette.js";
import { COLOR_SOURCES, colorSource } from "../system-look.js";
import { Icon, Select } from "./ui.jsx";

export const LANG_OPTIONS = [
  { value: "system", key: "lang.system" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

/** A row of colour swatches plus a custom colour well. */
function Swatches({ value, presets, onChange, label, caption, lead, children }) {
  const current = (value || "").toLowerCase();
  const isPreset = presets.some(([, hex]) => hex.toLowerCase() === current);
  return <div className="swatches-block">
    <div className="swatches" role="group" aria-label={label}>
      {lead}
      {presets.map(([name, hex]) => <button key={hex} type="button" className="swatch" style={{ "--sw": hex }}
        aria-label={name} title={name} aria-pressed={current === hex.toLowerCase()} onClick={() => onChange(hex)} />)}
      <label className="swatch swatch-custom" title={t("ap.otherColor")} data-active={!!current && !isPreset || undefined}
        style={{ "--sw": current && !isPreset ? current : "transparent" }}>
        <input type="color" aria-label={t("ap.otherColor")} value={/^#[0-9a-f]{6}$/.test(current) ? current : "#808080"} onChange={(e) => onChange(e.target.value)} />
        <Icon name="plus" />
      </label>
      {children}
    </div>
    <div className="swatch-foot">
      <HexField value={current} onChange={onChange} />
      {caption && <p className="swatch-caption">{caption}</p>}
    </div>
  </div>;
}

/** Type or paste an exact colour. Applies once it is a valid #rrggbb. */
function HexField({ value, onChange }) {
  const valid = (v) => /^#?[0-9a-f]{6}$/i.test(v);
  const [text, setText] = useState(valid(value) ? value.toUpperCase() : "");
  useEffect(() => { if (valid(value)) setText(value.toUpperCase()); }, [value]);
  const commit = (v) => { const hex = `#${v.replace(/^#/, "").toLowerCase()}`; if (valid(v) && hex !== value) onChange(hex); };
  return <label className="hex-field" data-invalid={text && !valid(text) || undefined}>
    <span className="hex-chip" style={{ "--sw": valid(text) ? `#${text.replace(/^#/, "")}` : "transparent" }} aria-hidden="true" />
    <input type="text" spellCheck={false} maxLength={7} aria-label={t("ap.hex")} placeholder="#RRGGBB" value={text}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
      onBlur={() => { if (!valid(text) && valid(value)) setText(value.toUpperCase()); }} />
  </label>;
}

/** Name of the picked colour: its palette name and Pantone reference, or
 * "Custom colour" with its hex. */
function paletteCaption(value) {
  const entry = paletteEntry(value);
  if (entry?.code) return `${entry.name} · PANTONE ${entry.code} · ${t("palette.year").replace("{year}", entry.year)}`;
  if (entry) return t("palette.brand");
  // A custom colour is already spelled out in the hex field beside it.
  return "";
}

/** The suggested palette first; a custom colour stays available. `sources`
 * adds one-off "copy the Windows accent / wallpaper colour" buttons. */
export function AccentPicker({ value, onChange, sources = false }) {
  const from = (source) => async () => {
    const hex = await source().catch(() => null);
    if (hex) onChange(hex);
  };
  return <Swatches value={value} label={t("ap.accent")} presets={ACCENT_PALETTE.map(({ name, hex }) => [name, hex])} onChange={onChange} caption={paletteCaption(value)}>
    {sources && <>
      <button type="button" className="chip" onClick={from(dockApi.systemAccent)}>{t("ap.systemShort")}</button>
      <button type="button" className="chip" onClick={from(dockApi.wallpaperAccent)}><Icon name="image" />{t("ap.wallpaperShort")}</button>
    </>}
  </Swatches>;
}

/** One colour setting laid out like Windows 11 Settings > Personalization >
 *  Colors: a preview of the colour in use and what it is, a drop-down for
 *  where it comes from, and, when chosen by hand, a grid of swatches that
 *  unfolds below. */
function ColorSetting({ label, preview, name, mode, modes, onMode, children }) {
  return <div className="color-setting" data-open={!!children || undefined}>
    <div className="color-setting-head">
      <span className="color-setting-preview" style={{ "--sw": preview }} aria-hidden="true" />
      <span className="color-setting-name">{name}</span>
      <Select label={label} value={mode} onChange={onMode} options={modes} />
    </div>
    {children && <div className="color-setting-body">{children}</div>}
  </div>;
}

/** Where the accent comes from: Windows, the wallpaper, or Booki's palette
 *  (which keeps a custom colour well for exact brand colours). */
export function ColorSourcePicker({ cfg, set, children }) {
  const source = colorSource(cfg);
  const [windows, setWindows] = useState("");
  const [wall, setWall] = useState("");
  useEffect(() => {
    let live = true;
    dockApi.systemAccent().then((hex) => { if (live && hex) setWindows(hex); }).catch(() => {});
    dockApi.wallpaperAccent().then((hex) => { if (live && hex) setWall(hex); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const custom = /^#[0-9a-f]{6}$/i.test(cfg?.accent || "") ? cfg.accent : "#dfaa75";
  const swatch = { windows: windows || "var(--accent)", wallpaper: wall || "#8a8a8a", custom };
  const name = source === "custom" ? (paletteEntry(custom)?.name || custom.toUpperCase()) : t(`look.${source}Now`);
  return <ColorSetting label={t("look.source")} preview={swatch[source]} name={name} mode={source}
    modes={COLOR_SOURCES.map((value) => ({ value, label: t(`look.${value}`) }))} onMode={(value) => set({ colorSource: value })}>
    {source === "custom" ? children : null}
  </ColorSetting>;
}

/** The dock's fill: automatic, from the wallpaper, or one of Booki's own
 *  fills. No free colour here: each fill holds up as glass and as solid. */
export function SurfaceColorPicker({ value, onChange }) {
  const current = String(value || "auto").toLowerCase();
  const picked = /^#[0-9a-f]{6}$/.test(current) ? current : "";
  const mode = picked ? "custom" : current === "wallpaper" ? "wallpaper" : "auto";
  const [wall, setWall] = useState("");
  useEffect(() => {
    let live = true;
    dockApi.wallpaperAccent().then((hex) => { if (live && hex) setWall(hex); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const fallback = SURFACE_TINT_PRESETS[1][1];
  const preset = SURFACE_TINT_PRESETS.find(([, hex]) => hex === picked);
  const preview = { auto: "var(--surface-tint, #2c2c2c)", wallpaper: wall || "#8a8a8a", custom: picked || fallback }[mode];
  const name = mode === "custom" ? (preset ? t(`tint.${preset[0]}`) : picked.toUpperCase()) : t(mode === "wallpaper" ? "surface.wallpaperNow" : "surface.autoNow");
  // Split by how light the fill is, not by position in the list.
  const light = ([, hex]) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16) > 384;
  const group = (title, list) => <div className="color-group">
    <span className="color-group-title">{title}</span>
    <div className="swatches" role="radiogroup" aria-label={title}>
      {list.map(([id, hex]) => <button key={hex} type="button" role="radio" className="swatch" style={{ "--sw": hex }}
        aria-label={t(`tint.${id}`)} title={t(`tint.${id}`)} aria-checked={picked === hex} aria-pressed={picked === hex} onClick={() => onChange(hex)} />)}
    </div>
  </div>;
  return <ColorSetting label={t("surface.color")} preview={preview} name={name} mode={mode}
    modes={[{ value: "auto", label: t("surface.auto") }, { value: "wallpaper", label: t("surface.wallpaper") }, { value: "custom", label: t("look.custom") }]}
    onMode={(next) => onChange(next === "custom" ? picked || fallback : next)}>
    {mode === "custom" ? <>{group(t("surface.darkFills"), SURFACE_TINT_PRESETS.filter((p) => !light(p)))}{group(t("surface.lightFills"), SURFACE_TINT_PRESETS.filter(light))}</> : null}
  </ColorSetting>;
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
const EDGES = ["top", "bottom", "left", "right"];
const SLOTS = ["start", "center", "end"];
const slotLabel = (slot) => t(`be.notch${slot[0].toUpperCase()}${slot.slice(1)}`);

/** Where the dock lives: one picture of the screen, and you click where the
 *  dock should go. The twelve spots are one radio group (arrow keys walk
 *  them); the chosen one holds the dock, a hovered one previews it. With
 *  several screens, a menu above says which screen the picture is. */
export const positionEdges = ["bottom", "top", "left", "right"];
export const positionSlots = SLOTS;
export { slotLabel };
export function PositionPicker({ cfg, set, afterPlacement, monitors = [] }) {
  const edge = EDGES.includes(cfg.edge) ? cfg.edge : "bottom";
  const slot = SLOTS.includes(cfg.notchPosition) ? cfg.notchPosition : "center";
  const chosen = cfg.monitor ?? -1;
  const screen = monitors.find((m) => m.index === chosen) || monitors.find((m) => m.primary) || monitors[0];
  const ratio = screen ? Math.min(2.4, Math.max(1.25, screen.w / screen.h)) : 16 / 10;
  const spots = EDGES.flatMap((e) => SLOTS.map((s) => ({ e, s })));
  const current = spots.findIndex((p) => p.e === edge && p.s === slot);
  const pick = (p) => set({ edge: p.e, notchPosition: p.s }, afterPlacement);
  const name = (p) => `${t(`edge.${p.e}`)} · ${slotLabel(p.s)}`;
  const walk = (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = spots[(current + step + spots.length) % spots.length];
    pick(next);
    requestAnimationFrame(() => event.currentTarget?.querySelector?.(`[data-spot="${next.e}-${next.s}"]`)?.focus());
  };
  // A small picture of the screen beside what it shows; the precise
  // controls are ordinary setting rows under it (see the Dock page).
  // A miniature desktop the width of the section: click a spot and a small
  // dock glides there; the current place reads as a chip on the screen.
  const vertical = edge === "left" || edge === "right";
  return <div className="position-picker">
    <div className="screen-map" style={{ aspectRatio: String(Math.max(ratio, 2.6)) }} role="radiogroup" aria-label={t("be.position")} onKeyDown={walk}>
      <span className="screen-window w1" aria-hidden="true" /><span className="screen-window w2" aria-hidden="true" />
      {spots.map((p) => {
        const on = p.e === edge && p.s === slot;
        return <button key={`${p.e}-${p.s}`} data-spot={`${p.e}-${p.s}`} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
          className={`screen-spot at-${p.e} slot-${p.s}`} aria-label={name(p)} title={name(p)} onClick={() => pick(p)}>
          <span className="screen-dock" />
        </button>;
      })}
      <span className={`screen-live-dock live-${edge} live-${slot}${vertical ? " vertical" : ""}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <span className="screen-chip" aria-live="polite">{name({ e: edge, s: slot })}</span>
      <span className="screen-hint">{t("be.positionHint")}</span>
    </div>
  </div>;
}

/** Records a shortcut with at least one modifier. */
export function HotkeyInput({ value, onChange, label }) {
  const capture = (e) => {
    if (e.key === "Tab") return;
    e.preventDefault();
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key) || !mods.length) return;
    const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    onChange([...mods, key].join("+"));
  };
  return <div className="hotkey">
    <input readOnly aria-label={label || t("sc.toggle")} value={formatHotkey(value, curLang())} placeholder={t("sc.press")} onKeyDown={capture} />
    {/* Always present so both shortcut rows line up; there is nothing to clear while empty. */}
    <button type="button" className="button" disabled={!value} onClick={() => onChange("")}>{t("sc.clear")}</button>
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
    {MODIFIERS.map((key) => <button key={key} type="button" className="chip" aria-pressed={current.includes(key)} onClick={() => toggle(key)}>{keyLabel(key, curLang())}</button>)}
  </div>;
}
