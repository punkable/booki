/* Booki Dock — Settings (React). Modern sidebar + tabbed panels.
   Shares the config bridge in api.js; changes apply to the dock live. */

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  config as configApi,
  dock as dockApi,
  pickAppFile,
  pickFolder,
  pickImageFile,
  pickSavePath,
  pickJsonFile,
  emitConfigChanged,
  onConfigChanged,
  onShowChangelog,
  closeSelf,
  logMessage,
} from "./api.js";
import { CHANGELOG } from "./changelog-data.js";

// One-click theme presets (accent + light/dark).
const THEME_PRESETS = [
  { name: "Booki", accent: "#dfaa75", theme: "system" },
  { name: "Océano", accent: "#3a86ff", theme: "dark" },
  { name: "Bosque", accent: "#2bb673", theme: "dark" },
  { name: "Atardecer", accent: "#fb5607", theme: "light" },
  { name: "Uva", accent: "#8338ec", theme: "dark" },
  { name: "Rosa", accent: "#ff006e", theme: "light" },
];
import { applyTheme } from "./theme.js";
import { checkForUpdate, installUpdate } from "./update.js";
import { t, setLang } from "./i18n.js";
import { icon } from "./icons.js";

// Small icon button used across the Apps list.
function IconBtn({ name, title, onClick, danger, onPointerDown }) {
  return (
    <button
      type="button"
      className={"pin-btn ico" + (danger ? " del" : "")}
      title={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
      dangerouslySetInnerHTML={{ __html: icon(name) }}
    />
  );
}
import {
  ICON_LIBRARY,
  ICON_STYLES,
  isLibIcon,
  parseLibIcon,
  libToken,
  libIconDataUri,
  resolveLibIcon,
  currentAccentColors,
} from "./icon-library.js";

window.addEventListener("error", (e) => logMessage("error", `settings: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `settings: unhandled ${e.reason}`)
);

const uid = () => Math.random().toString(36).slice(2, 9);

const ACCENTS = [
  ["Tan (Booki)", "#dfaa75"],
  ["Ámbar", "#ffbe0b"],
  ["Naranja", "#fb5607"],
  ["Rosa", "#ff006e"],
  ["Violeta", "#8338ec"],
  ["Azul", "#3a86ff"],
  ["Verde", "#2ecc71"],
];

const TABS = [
  ["appearance", "tab.appearance"],
  ["behavior", "tab.behavior"],
  ["apps", "tab.apps"],
  ["shortcuts", "tab.shortcuts"],
  ["about", "tab.about"],
];

// ── Reusable controls ──

function Row({ label, children, hint }) {
  return (
    <div className="r-row">
      <div className="r-label">
        {label}
        {hint && <span className="r-hint">{hint}</span>}
      </div>
      <div className="r-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="r-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="r-switch" />
    </label>
  );
}

function Slider({ value, min, max, step, onChange, fmt }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const fill = `linear-gradient(to right, var(--accent) ${pct}%, var(--track) ${pct}%)`;
  return (
    <div className="r-slider">
      <div className="slider-wrap">
        <input
          type="range"
          className="slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ background: fill }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="slider-bubble" style={{ left: `${pct}%` }}>
          {fmt ? fmt(value) : value}
        </span>
      </div>
    </div>
  );
}

// Sliding segmented control (replaces small dropdowns). options: [{value,label,icon}]
function SegmentedControl({ value, options, onChange }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="seg" style={{ "--n": options.length, "--i": idx }}>
      <span className="seg-thumb" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={"seg-item" + (o.value === value ? " active" : "")}
          onClick={() => onChange(o.value)}
          title={o.label}
        >
          {o.icon && <span className="seg-ico">{o.icon}</span>}
          <span className="seg-lbl">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// Click an edge of a mini screen to anchor the dock there.
function EdgePicker({ value, onChange }) {
  const edges = ["top", "bottom", "left", "right"];
  return (
    <div className="edgepick">
      <div className="edgepick-screen">
        {edges.map((e) => (
          <button
            key={e}
            type="button"
            className={`edgepick-edge ep-${e}` + (value === e ? " active" : "")}
            onClick={() => onChange(e)}
            title={t(`edge.${e}`)}
            aria-label={t(`edge.${e}`)}
          />
        ))}
        <span className="edgepick-label">{t(`edge.${value}`)}</span>
      </div>
    </div>
  );
}

// Pick a monitor from boxes scaled to their real geometry.
function MonitorPicker({ value, monitors, onChange }) {
  if (!monitors || monitors.length === 0) {
    return <span className="muted">{t("mon.auto")}</span>;
  }
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const maxX = Math.max(...monitors.map((m) => m.x + m.w));
  const maxY = Math.max(...monitors.map((m) => m.y + m.h));
  const W = maxX - minX || 1;
  const H = maxY - minY || 1;
  const scale = Math.min(220 / W, 96 / H);
  return (
    <div className="monpick">
      <button
        type="button"
        className={"monpick-auto" + (value === -1 ? " active" : "")}
        onClick={() => onChange(-1)}
      >
        {t("mon.auto")}
      </button>
      <div className="monpick-stage" style={{ width: W * scale, height: H * scale }}>
        {monitors.map((m) => (
          <button
            key={m.index}
            type="button"
            className={"monpick-box" + (value === m.index ? " active" : "") + (m.primary ? " primary" : "")}
            style={{
              position: "absolute",
              left: (m.x - minX) * scale + 2,
              top: (m.y - minY) * scale + 2,
              width: m.w * scale - 4,
              height: m.h * scale - 4,
            }}
            onClick={() => onChange(m.index)}
            title={m.name}
          >
            <span>{m.index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Live miniature of the dock that reacts to every appearance/behavior change.
function MiniDockPreview({ cfg }) {
  const items = (cfg.pinned || []).filter((p) => p.kind !== "separator").slice(0, 7);
  const count = items.length || 5;
  const scale = 0.42;
  const size = Math.round((cfg.iconSize || 48) * scale);
  const gap = Math.round((cfg.spacing ?? 6) * scale + 2);
  const vertical = cfg.edge === "left" || cfg.edge === "right";
  const mat = (cfg.materialStrength ?? 70) / 100;
  const alpha = Math.max(0.28, Math.min(0.96, 0.3 + mat * 0.66));
  const mid = Math.floor(count / 2);
  const zoom = cfg.magnification ? cfg.zoom || 1.35 : 1;
  const radius = Math.round((cfg.cornerRadius ?? 12) * scale);
  return (
    <div className={"preview prev-" + (cfg.edge || "bottom")}>
      <div
        className="preview-bar"
        style={{
          flexDirection: vertical ? "column" : "row",
          gap,
          borderRadius: radius + 5,
          background: `color-mix(in srgb, var(--layer-strong) ${alpha * 100}%, transparent)`,
        }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const s = i === mid ? Math.round(size * zoom) : size;
          return (
            <span
              key={i}
              className="preview-tile"
              style={{
                width: s,
                height: s,
                borderRadius: radius,
                transform: i === mid ? (vertical ? "translateX(-4px)" : "translateY(-4px)") : "none",
              }}
            >
              <PreviewIcon item={items[i]} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PreviewIcon({ item }) {
  const [src, setSrc] = useState(item && item.icon ? item.icon : null);
  useEffect(() => {
    let alive = true;
    if (item && !item.icon && item.path) {
      dockApi.appIcon(item.path).then((u) => alive && setSrc(u));
    }
    return () => {
      alive = false;
    };
  }, [item && item.path]);
  if (src) return <img src={src} alt="" />;
  return <span className="preview-glyph" />;
}

// A more intuitive accent picker: large tappable swatches with a check on the
// active one, plus a custom-color chip that shows the live value + hex.
function AccentPicker({ value, onChange }) {
  const v = (value || "").toLowerCase();
  const isPreset = ACCENTS.some(([, val]) => val.toLowerCase() === v);
  return (
    <div className="accent-picker">
      <div className="accent-swatches">
        {ACCENTS.map(([name, val]) => (
          <button
            key={val}
            type="button"
            className={"accent-sw" + (v === val.toLowerCase() ? " active" : "")}
            style={{ "--sw": val }}
            title={name}
            onClick={() => onChange(val)}
          >
            <span className="accent-check">✓</span>
          </button>
        ))}
        <label
          className={"accent-custom" + (!isPreset ? " active" : "")}
          style={{ "--sw": value }}
          title={t("ap.custom")}
        >
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <span className="accent-plus">{isPreset ? "+" : "✓"}</span>
        </label>
        <button
          type="button"
          className="accent-system"
          title={t("ap.system")}
          onClick={async () => {
            const hex = await dockApi.systemAccent();
            if (hex) onChange(hex);
          }}
        >
          ⊙
        </button>
      </div>
      <span className="accent-hex">{(value || "").toUpperCase()}</span>
    </div>
  );
}

// One installed-app suggestion icon (native icon, falls back to a letter).
function SuggIcon({ path, name }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    dockApi.appIcon(path).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <span className="sugg-thumb">
      {src ? <img src={src} alt="" /> : (name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

// Suggests apps installed on the PC (scanned from the Start Menu) so the user
// can pin them with one click instead of browsing the filesystem.
function Suggestions({ cfg, set }) {
  const [groups, setGroups] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    dockApi.listInstalledApps().then((a) => setGroups(normalizeGroups(a)));
  }, []);
  if (!groups || groups.length === 0) return null;
  const pinned = new Set(cfg.pinned.map((p) => (p.path || "").toLowerCase()));
  const add = (a) => {
    if (pinned.has((a.path || "").toLowerCase())) return;
    set({ pinned: [...cfg.pinned, mkApp(a.path)] });
  };
  const addGroup = (g) => {
    const fresh = g.items.filter((a) => !pinned.has((a.path || "").toLowerCase()));
    if (!fresh.length) return;
    set({
      pinned: [
        ...cfg.pinned,
        { id: uid(), name: g.name || t("apps.suggestGeneral"), path: "", args: [], kind: "group", children: fresh.map(mkApp) },
      ],
    });
  };
  const ql = q.trim().toLowerCase();
  // While searching, show a flat list of matches across every group.
  const view = ql
    ? [{ name: "", items: groups.flatMap((g) => g.items).filter((a) => a.name.toLowerCase().includes(ql)).slice(0, 60) }]
    : groups;

  const Tile = (a) => {
    const isPinned = pinned.has((a.path || "").toLowerCase());
    return (
      <button key={a.path} type="button" className={"sugg-item" + (isPinned ? " pinned" : "")}
        title={a.name} onClick={() => add(a)} disabled={isPinned}>
        <SuggIcon path={a.path} name={a.name} />
        <span className="sugg-name">{a.name}</span>
      </button>
    );
  };

  return (
    <div className="s-card-inner">
      <h3>{t("apps.suggest")}</h3>
      <p className="muted">{t("apps.suggestHint")}</p>
      <input className="sugg-search" placeholder={t("apps.search")} value={q}
        onChange={(e) => setQ(e.target.value)} />
      {view.map((g, gi) => (
        <div key={g.name || "general-" + gi} className="sugg-group">
          {!ql && (
            <div className="sugg-group-head">
              <span className="sugg-group-name">{g.name || t("apps.suggestGeneral")}</span>
              {g.name && g.items.length > 1 && (
                <button className="sugg-group-add" onClick={() => addGroup(g)}>
                  {t("apps.pinFolder")}
                </button>
              )}
            </div>
          )}
          <div className="sugg-grid">{g.items.map(Tile)}</div>
        </div>
      ))}
    </div>
  );
}

// Accept either the new grouped shape ([{name, items}]) or a legacy flat list.
function normalizeGroups(a) {
  if (!Array.isArray(a)) return [];
  if (a.length && a[0] && Array.isArray(a[0].items)) return a.filter((g) => g.items && g.items.length);
  return a.length ? [{ name: "", items: a }] : [];
}

function PinThumb({ item }) {
  const [src, setSrc] = useState(isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon || null);
  useEffect(() => {
    let alive = true;
    if (isLibIcon(item.icon)) {
      setSrc(resolveLibIcon(item.icon));
    } else if (item.icon) {
      setSrc(item.icon);
    } else if (item.path) {
      dockApi.appIcon(item.path).then((u) => alive && setSrc(u));
    }
    return () => {
      alive = false;
    };
  }, [item.path, item.icon]);
  if (item.kind === "group") {
    return <span className="pin-thumb folder" dangerouslySetInnerHTML={{ __html: icon("folder") }} />;
  }
  if (item.kind === "widget") {
    return <span className="pin-thumb widget">{WIDGET_EMOJI[item.widget] || "▦"}</span>;
  }
  return (
    <span className="pin-thumb">
      {src ? <img src={src} alt="" /> : (item.name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

const WIDGET_EMOJI = { clock: "🕒", cpu: "🧠", ram: "🧊", disk: "💾", net: "📶", uptime: "⏱️", battery: "🔋", notes: "📝" };

function HotkeyInput({ value, onChange }) {
  const capture = (e) => {
    e.preventDefault();
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Super");
    const k = e.key;
    if (["Control", "Alt", "Shift", "Meta"].includes(k)) return;
    const key = k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k;
    if (mods.length === 0) return; // require a modifier
    onChange([...mods, key].join("+"));
  };
  return (
    <div className="r-hotkey">
      <input
        readOnly
        value={value || ""}
        placeholder={t("sc.press")}
        onKeyDown={capture}
      />
      {value && (
        <button className="s-btn s-btn-soft" onClick={() => onChange("")}>
          {t("sc.clear")}
        </button>
      )}
    </div>
  );
}

// ── Panels ──

function Appearance({ cfg, set }) {
  return (
    <>
      <h1>{t("ap.title")}</h1>
      <MiniDockPreview cfg={cfg} />
      <Row label={t("ap.theme")}>
        <SegmentedControl
          value={cfg.theme || "system"}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: "system", label: t("theme.system") },
            { value: "light", label: t("theme.light"), icon: "☀" },
            { value: "dark", label: t("theme.dark"), icon: "☾" },
          ]}
        />
      </Row>
      <Row label={t("ap.language")}>
        <SegmentedControl
          value={cfg.language || "system"}
          onChange={(v) => set({ language: v })}
          options={[
            { value: "system", label: t("lang.system") },
            { value: "es", label: "ES" },
            { value: "en", label: "EN" },
          ]}
        />
      </Row>
      <Row label={t("ap.accent")} hint={t("ap.accentHint")}>
        <AccentPicker value={cfg.accent} onChange={(v) => set({ accent: v })} />
      </Row>
      <Row label={t("ap.presets")} hint={t("ap.presetsHint")}>
        <div className="preset-row">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="preset-chip"
              title={p.name}
              style={{ background: p.accent }}
              onClick={() => set({ accent: p.accent, theme: p.theme })}
            >
              <span className="preset-dot" data-theme={p.theme} />
            </button>
          ))}
        </div>
      </Row>
      <Row label={t("ap.iconSize")}>
        <Slider value={cfg.iconSize} min={32} max={80} step={4} fmt={(v) => `${v}px`}
          onChange={(v) => set({ iconSize: v })} />
      </Row>
      <Row label={t("ap.spacing")}>
        <Slider value={cfg.spacing} min={0} max={20} step={1} fmt={(v) => `${v}px`}
          onChange={(v) => set({ spacing: v })} />
      </Row>
      <Row label={t("ap.radius")} hint={t("ap.radiusHint")}>
        <Slider value={cfg.cornerRadius ?? 12} min={0} max={24} step={1} fmt={(v) => `${v}px`}
          onChange={(v) => set({ cornerRadius: v })} />
      </Row>
      <Row label={t("ap.translucency")} hint={t("be.materialHint")}>
        <Slider value={cfg.materialStrength ?? 70} min={0} max={100} step={5}
          fmt={(v) => `${v}%`}
          onChange={(v) => { set({ materialStrength: v }); dockApi.setMaterial(v); }} />
      </Row>
      <Row label={t("ap.backup")} hint={t("ap.backupHint")}>
        <div className="s-actions" style={{ margin: 0 }}>
          <button className="s-btn s-btn-soft" onClick={async () => {
            const p = await pickSavePath("booki-config.json");
            if (p) await dockApi.exportConfig(p);
          }}>{t("ap.export")}</button>
          <button className="s-btn s-btn-soft" onClick={async () => {
            const p = await pickJsonFile();
            if (!p) return;
            const fresh = await dockApi.importConfig(p);
            if (fresh) set(fresh);
          }}>{t("ap.import")}</button>
        </div>
      </Row>
    </>
  );
}

function Behavior({ cfg, set }) {
  const [monitors, setMonitors] = useState([]);
  const [autostart, setAutostart] = useState(!!cfg.autostart);
  useEffect(() => {
    dockApi.listMonitors().then((m) => setMonitors(m || []));
    dockApi.getAutostart().then((v) => setAutostart(!!v));
  }, []);
  return (
    <>
      <h1>{t("be.title")}</h1>
      <MiniDockPreview cfg={cfg} />
      <Row label={t("be.edge")}>
        <EdgePicker value={cfg.edge || "bottom"} onChange={(v) => set({ edge: v })} />
      </Row>
      <Row label={t("be.monitor")}>
        <MonitorPicker value={cfg.monitor} monitors={monitors}
          onChange={(v) => set({ monitor: v })} />
      </Row>
      <Row label={t("be.anim")}>
        <SegmentedControl
          value={cfg.magnifyStyle || "spring"}
          onChange={(v) => set({ magnifyStyle: v })}
          options={[
            { value: "spring", label: t("anim.springShort") },
            { value: "smooth", label: t("anim.smoothShort") },
            { value: "off", label: t("anim.offShort") },
          ]}
        />
      </Row>
      <Toggle label={t("be.magnify")} checked={cfg.magnification}
        onChange={(v) => set({ magnification: v })} />
      {cfg.magnification && (
        <Row label={t("be.zoom")} hint={t("be.zoomHint")}>
          <Slider value={Math.round(cfg.zoom * 100)} min={110} max={150} step={5}
            fmt={(v) => `${v}%`} onChange={(v) => set({ zoom: v / 100 })} />
        </Row>
      )}
      <Row label={t("be.autoHide")}>
        <SegmentedControl
          value={cfg.autoHideMode || "smart"}
          onChange={(v) => set({ autoHideMode: v })}
          options={[
            { value: "off", label: t("hide.offShort") },
            { value: "smart", label: t("hide.smartShort") },
            { value: "edge", label: t("hide.edgeShort") },
          ]}
        />
      </Row>
      {cfg.autoHideMode !== "off" && (
        <>
          <Row label={t("be.notchPos")} hint={t("be.notchPosHint")}>
            <SegmentedControl
              value={cfg.notchPosition || "center"}
              onChange={(v) => set({ notchPosition: v })}
              options={[
                { value: "start", label: t("be.notchStart") },
                { value: "center", label: t("be.notchCenter") },
                { value: "end", label: t("be.notchEnd") },
              ]}
            />
          </Row>
          <Toggle label={t("be.notchPeek")} checked={cfg.notchPeek !== false}
            onChange={(v) => set({ notchPeek: v })} />
        </>
      )}
      <Toggle label={t("be.showLabels")} checked={cfg.showLabels}
        onChange={(v) => set({ showLabels: v })} />
      <Toggle label={t("be.showIndicators")} checked={cfg.showIndicators}
        onChange={(v) => set({ showIndicators: v })} />
      <Toggle label={t("be.alwaysOnTop")} checked={cfg.alwaysOnTop}
        onChange={(v) => { set({ alwaysOnTop: v }); dockApi.setAlwaysOnTop(v); }} />
      <Toggle label={t("be.autostart")} checked={autostart}
        onChange={(v) => { setAutostart(v); set({ autostart: v }); dockApi.setAutostart(v); }} />
      {cfg.autoHideMode === "edge" && (
        <Row label={t("be.hideDelay")}>
          <Slider value={cfg.autoHideDelay} min={0} max={2000} step={50}
            fmt={(v) => `${v}ms`} onChange={(v) => set({ autoHideDelay: v })} />
        </Row>
      )}
    </>
  );
}

// Modal to choose a pin's icon: built-in library (with styles), upload an image,
// or reset to the app's real icon.
function IconPickerModal({ item, onPick, onClose }) {
  const [style, setStyle] = useState(isLibIcon(item.icon) ? parseLibIcon(item.icon).style : "badge");
  const colors = currentAccentColors();
  const upload = async () => {
    const path = await pickImageFile();
    if (!path) return;
    const uri = (await dockApi.imageDataUri(path)) || path;
    onPick(uri);
  };
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t("icon.title")}</strong>
          <button className="pin-btn" onClick={onClose}>✕</button>
        </div>
        <div className="icon-styles">
          {ICON_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              className={"seg-mini" + (style === s ? " active" : "")}
              onClick={() => setStyle(s)}
            >
              {t("icon.style." + s)}
            </button>
          ))}
        </div>
        <div className="icon-grid">
          {ICON_LIBRARY.map((name) => (
            <button
              key={name}
              type="button"
              className="icon-cell"
              title={name}
              onClick={() => onPick(libToken(name, style))}
            >
              <img src={libIconDataUri(name, style, colors)} alt={name} />
            </button>
          ))}
        </div>
        <div className="s-actions" style={{ marginTop: 14 }}>
          <button className="s-btn s-btn-soft" onClick={upload}>{t("icon.upload")}</button>
          <button className="s-btn s-btn-soft" onClick={() => onPick(null)}>{t("icon.reset")}</button>
        </div>
      </div>
    </div>
  );
}

// Visually edit a widget's look: variant, accent color, motion and icon.
function WidgetStyleModal({ item, accent, onChange, onClose }) {
  const st = item.style || {};
  const variant = st.variant || "glass";
  const set1 = (patch) => onChange({ ...st, ...patch });
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t("w.styleTitle")}</strong>
          <button className="pin-btn" onClick={onClose}>✕</button>
        </div>
        {item.widget === "notes" && (
          <Row label={t("w.note")}>
            <input
              className="web-url"
              type="text"
              value={st.note || ""}
              placeholder={t("w.notesEmpty")}
              onChange={(e) => set1({ note: e.target.value })}
            />
          </Row>
        )}
        <Row label={t("w.variant")}>
          <SegmentedControl
            value={variant}
            onChange={(v) => set1({ variant: v })}
            options={[
              { value: "glass", label: t("w.v.glass") },
              { value: "solid", label: t("w.v.solid") },
              { value: "gradient", label: t("w.v.gradient") },
              { value: "outline", label: t("w.v.outline") },
              { value: "minimal", label: t("w.v.minimal") },
            ]}
          />
        </Row>
        <Row label={t("w.color")}>
          <AccentPicker value={st.color || accent} onChange={(v) => set1({ color: v })} />
        </Row>
        <Toggle label={t("w.animated")} checked={!!st.animated} onChange={(v) => set1({ animated: v })} />
        <Toggle label={t("w.showIcon")} checked={st.icon !== false} onChange={(v) => set1({ icon: v })} />
        <div className="s-actions" style={{ marginTop: 14 }}>
          <button className="s-btn" onClick={onClose}>{t("w.done")}</button>
        </div>
      </div>
    </div>
  );
}

function Apps({ cfg, set }) {
  const listRef = useRef(null);
  const pinnedRef = useRef(cfg.pinned);
  pinnedRef.current = cfg.pinned;
  const drag = useRef(null);
  const childDrag = useRef(null);
  const mergeRef = useRef(-1);
  const [mergeInto, setMergeInto] = useState(-1);
  const [iconFor, setIconFor] = useState(-1);
  const [styleFor, setStyleFor] = useState(-1);
  const [webUrl, setWebUrl] = useState("");
  const [openIds, setOpenIds] = useState({});
  const toggleOpen = (id) => setOpenIds((o) => ({ ...o, [id]: !o[id] }));
  const setIcon = (i, value) =>
    set({ pinned: cfg.pinned.map((p, k) => (k === i ? { ...p, icon: value } : p)) });
  const setStyle = (i, value) =>
    set({ pinned: cfg.pinned.map((p, k) => (k === i ? { ...p, style: value } : p)) });
  const addWebsite = async () => {
    let url = webUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const host = url.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "");
    let icon = null;
    try {
      icon = await dockApi.fetchFavicon(url);
    } catch (_) {}
    set({ pinned: [...cfg.pinned, { id: uid(), name: host, path: url, args: [], kind: "app", icon }] });
    setWebUrl("");
  };
  // Dissolve a folder, spilling its items back to the dock (no data loss).
  const ungroup = (i) => {
    const grp = cfg.pinned[i];
    if (!grp || grp.kind !== "group") return;
    set({ pinned: cfg.pinned.flatMap((p, k) => (k === i ? grp.children || [] : [p])) });
  };

  const doMerge = (from, to) => {
    const arr = pinnedRef.current;
    const dragged = arr[from];
    const target = arr[to];
    const merged =
      target.kind === "group"
        ? { ...target, children: [...(target.children || []), dragged] }
        : { id: uid(), name: t("group.new"), path: "", args: [], kind: "group", children: [target, dragged] };
    set({ pinned: arr.map((p, k) => (k === to ? merged : p)).filter((_, k) => k !== from) });
  };
  const startDrag = (i) => (e) => {
    e.preventDefault();
    drag.current = { from: i };
    mergeRef.current = -1;
    setMergeInto(-1);
    const onMove = (ev) => {
      // Only top-level rows map 1:1 to cfg.pinned (folder children aren't draggable).
      const lis = [...listRef.current.querySelectorAll(".pin-item:not(.pin-child)")];
      const from = drag.current.from;
      // Dropping onto the CENTER of another app/group row → make a folder.
      let over = -1;
      for (let k = 0; k < lis.length; k++) {
        const r = lis[k].getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) { over = k; break; }
      }
      if (over >= 0 && over !== from) {
        const r = lis[over].getBoundingClientRect();
        const center = ev.clientY > r.top + r.height * 0.3 && ev.clientY < r.bottom - r.height * 0.3;
        const dragged = pinnedRef.current[from];
        const target = pinnedRef.current[over];
        const canMerge = dragged.kind === "app" && (target.kind === "app" || target.kind === "group");
        if (center && canMerge) {
          if (mergeRef.current !== over) { mergeRef.current = over; setMergeInto(over); }
          return; // aiming to merge → don't reorder
        }
      }
      if (mergeRef.current !== -1) { mergeRef.current = -1; setMergeInto(-1); }
      // Reorder.
      let to = lis.findIndex((li) => {
        const r = li.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (to === -1) to = pinnedRef.current.length - 1;
      if (to >= 0 && to !== from) {
        const p = [...pinnedRef.current];
        const [m] = p.splice(from, 1);
        p.splice(to, 0, m);
        drag.current.from = to;
        set({ pinned: p });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      const m = mergeRef.current;
      if (m >= 0 && m !== drag.current.from) doMerge(drag.current.from, m);
      mergeRef.current = -1;
      setMergeInto(-1);
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };
  // Drag a folder's child up/down to reorder it within that folder.
  const startDragChild = (gi, ci) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    childDrag.current = { gi, from: ci };
    const onMove = (ev) => {
      const rows = [...listRef.current.querySelectorAll(`.pin-child-item[data-folder="${gi}"]`)];
      let to = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return ev.clientY < b.top + b.height / 2;
      });
      if (to === -1) to = rows.length - 1;
      const from = childDrag.current.from;
      if (to >= 0 && to !== from) {
        const kids = [...(pinnedRef.current[gi].children || [])];
        const [m] = kids.splice(from, 1);
        kids.splice(to, 0, m);
        childDrag.current.from = to;
        set({ pinned: pinnedRef.current.map((p, k) => (k === gi ? { ...p, children: kids } : p)) });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      childDrag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };
  const remove = (i) => set({ pinned: cfg.pinned.filter((_, k) => k !== i) });
  const addApp = async () => {
    const path = await pickAppFile();
    if (path) set({ pinned: [...cfg.pinned, mkApp(path)] });
  };
  const addFolder = async () => {
    const path = await pickFolder();
    if (path) set({ pinned: [...cfg.pinned, mkApp(path)] });
  };
  const addSep = () =>
    set({ pinned: [...cfg.pinned, { id: uid(), name: "", path: "", args: [], kind: "separator" }] });
  const addWidget = (widget, label) =>
    set({ pinned: [...cfg.pinned, { id: uid(), name: label, path: "", args: [], kind: "widget", widget }] });
  const newFolder = () => {
    const id = uid();
    set({ pinned: [...cfg.pinned, { id, name: t("group.new"), path: "", args: [], kind: "group", children: [] }] });
    setOpenIds((o) => ({ ...o, [id]: true }));
  };
  // Edit a folder's contents (kind === "group", children[]). Auto-dissolves a
  // folder left with fewer than 2 items, matching the dock's behavior.
  const settleFolder = (gi, kids, extra = []) => {
    if (kids.length < 2) set({ pinned: cfg.pinned.flatMap((p, k) => (k === gi ? [...kids, ...extra] : [p])) });
    else set({ pinned: cfg.pinned.flatMap((p, k) => (k === gi ? [{ ...p, children: kids }, ...extra] : [p])) });
  };
  const removeChild = (gi, childId) =>
    settleFolder(gi, (cfg.pinned[gi].children || []).filter((c) => c.id !== childId));
  const takeOutChild = (gi, childId) => {
    const grp = cfg.pinned[gi];
    const child = (grp.children || []).find((c) => c.id === childId);
    if (!child) return;
    settleFolder(gi, (grp.children || []).filter((c) => c.id !== childId), [child]);
  };
  const addToFolder = async (gi) => {
    const path = await pickAppFile();
    if (!path) return;
    set({ pinned: cfg.pinned.map((p, k) => (k === gi ? { ...p, children: [...(p.children || []), mkApp(path)] } : p)) });
  };
  const renameChild = (gi, childId, name) =>
    set({
      pinned: cfg.pinned.map((p, k) =>
        k === gi ? { ...p, children: (p.children || []).map((c) => (c.id === childId ? { ...c, name } : c)) } : p
      ),
    });

  return (
    <>
      <h1>{t("apps.title")}</h1>
      <p className="muted">{t("apps.hint")}</p>
      <ul className="pin-list" ref={listRef}>
        {cfg.pinned.length === 0 && <li className="pin-empty">{t("apps.empty")}</li>}
        {cfg.pinned.flatMap((item, i) => {
          const isGroup = item.kind === "group";
          const open = isGroup && openIds[item.id];
          const rows = [
            <li key={item.id} className={"pin-item" + (item.kind === "separator" ? " sep" : "") + (isGroup ? " is-folder" : "") + (mergeInto === i ? " merge-into" : "")}>
              <span className="pin-left">
                <button className="pin-handle" title={t("apps.drag")}
                  onPointerDown={startDrag(i)} dangerouslySetInnerHTML={{ __html: icon("grip") }} />
                {isGroup && (
                  <IconBtn name={open ? "chevron-down" : "chevron-right"} title={t("apps.editFolder")}
                    onClick={() => toggleOpen(item.id)} />
                )}
                {item.kind !== "separator" && <PinThumb item={item} />}
                {isGroup ? (
                  <input
                    className="pin-name-edit"
                    value={item.name}
                    onChange={(e) =>
                      set({ pinned: cfg.pinned.map((p, k) => (k === i ? { ...p, name: e.target.value } : p)) })
                    }
                  />
                ) : (
                  <span className="pin-name" title={item.path}>
                    {item.kind === "separator" ? t("apps.sep") : item.name}
                  </span>
                )}
                {isGroup && <span className="pin-count">{(item.children || []).length}</span>}
              </span>
              <span className="pin-actions">
                {isGroup && <IconBtn name="ungroup" title={t("group.ungroup")} onClick={() => ungroup(i)} />}
                {item.kind === "widget" && <IconBtn name="palette" title={t("w.styleTitle")} onClick={() => setStyleFor(i)} />}
                {item.kind !== "separator" && item.kind !== "widget" && !isGroup && (
                  <IconBtn name="palette" title={t("apps.changeIcon")} onClick={() => setIconFor(i)} />
                )}
                {(item.kind === "app" || item.kind === "folder") && (
                  <IconBtn name="external" title={t("apps.openLoc")} onClick={() => dockApi.openLocation(item.path)} />
                )}
                <IconBtn name="trash" danger title={t("apps.remove")} onClick={() => remove(i)} />
              </span>
            </li>,
          ];
          if (open) {
            (item.children || []).forEach((c, ci) => {
              rows.push(
                <li key={item.id + ":" + c.id} className="pin-item pin-child pin-child-item" data-folder={i}>
                  <span className="pin-left">
                    <button className="pin-handle" title={t("apps.drag")}
                      onPointerDown={startDragChild(i, ci)} dangerouslySetInnerHTML={{ __html: icon("grip") }} />
                    <PinThumb item={c} />
                    <input
                      className="pin-name-edit"
                      value={c.name}
                      onChange={(e) => renameChild(i, c.id, e.target.value)}
                    />
                  </span>
                  <span className="pin-actions">
                    <IconBtn name="take-out" title={t("group.takeOut")} onClick={() => takeOutChild(i, c.id)} />
                    <IconBtn name="trash" danger title={t("apps.remove")} onClick={() => removeChild(i, c.id)} />
                  </span>
                </li>
              );
            });
            rows.push(
              <li key={item.id + ":add"} className="pin-item pin-child pin-add-row">
                <button className="s-btn s-btn-soft pin-add-btn" onClick={() => addToFolder(i)}
                  dangerouslySetInnerHTML={{ __html: icon("folder-plus") + `<span>${t("apps.addToFolder")}</span>` }} />
              </li>
            );
          }
          return rows;
        })}
      </ul>
      <div className="s-actions">
        <button className="s-btn" onClick={addApp}>{t("apps.addApp")}</button>
        <button className="s-btn s-btn-soft" onClick={addFolder}>{t("apps.addFolder")}</button>
        <button className="s-btn s-btn-soft" onClick={newFolder}>{t("apps.newFolder")}</button>
        <button className="s-btn s-btn-soft" onClick={addSep}>{t("apps.addSep")}</button>
      </div>
      <h2 className="s-subhead">{t("apps.widgets")}</h2>
      <p className="muted">{t("apps.widgetsHint")}</p>
      <div className="s-actions">
        <button className="s-btn s-btn-soft" onClick={() => addWidget("clock", t("w.clock"))}>＋ {t("w.clock")}</button>
        <button className="s-btn s-btn-soft" onClick={() => addWidget("cpu", "CPU")}>＋ CPU</button>
        <button className="s-btn s-btn-soft" onClick={() => addWidget("ram", "RAM")}>＋ RAM</button>
        <button className="s-btn s-btn-soft" onClick={() => addWidget("disk", t("w.disk"))}>＋ {t("w.disk")}</button>
        <button className="s-btn s-btn-soft" onClick={() => addWidget("net", t("w.net"))}>＋ {t("w.net")}</button>
        <button className="s-btn s-btn-soft" onClick={() => addWidget("uptime", t("w.uptime"))}>＋ {t("w.uptime")}</button>
        <button className="s-btn s-btn-soft" onClick={() => addWidget("battery", t("w.battery"))}>＋ {t("w.battery")}</button>
        <button className="s-btn s-btn-soft" onClick={() => addWidget("notes", t("w.notes"))}>＋ {t("w.notes")}</button>
      </div>
      <h2 className="s-subhead">{t("apps.web")}</h2>
      <p className="muted">{t("apps.webHint")}</p>
      <div className="web-add">
        <input
          className="r-hotkey-input web-url"
          type="text"
          placeholder={t("apps.webPlaceholder")}
          value={webUrl}
          onChange={(e) => setWebUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addWebsite()}
        />
        <button className="s-btn" onClick={addWebsite}>{t("apps.webAdd")}</button>
      </div>
      <Suggestions cfg={cfg} set={set} />
      {iconFor >= 0 && cfg.pinned[iconFor] && (
        <IconPickerModal
          item={cfg.pinned[iconFor]}
          onClose={() => setIconFor(-1)}
          onPick={(value) => { setIcon(iconFor, value); setIconFor(-1); }}
        />
      )}
      {styleFor >= 0 && cfg.pinned[styleFor] && (
        <WidgetStyleModal
          item={cfg.pinned[styleFor]}
          accent={cfg.accent}
          onChange={(value) => setStyle(styleFor, value)}
          onClose={() => setStyleFor(-1)}
        />
      )}
    </>
  );
}

function mkApp(path) {
  const file = String(path).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "App";
  return { id: uid(), name: file.replace(/\.(exe|lnk|bat|cmd)$/i, ""), path, args: [], kind: "app" };
}

function Shortcuts({ cfg, set }) {
  return (
    <>
      <h1>{t("sc.title")}</h1>
      <Row label={t("sc.toggle")} hint={t("sc.global")}>
        <HotkeyInput
          value={cfg.hotkey}
          onChange={(v) => {
            set({ hotkey: v });
            dockApi.setHotkey(v);
          }}
        />
      </Row>
      <div className="s-card-inner">
        <h3>{t("sc.other")}</h3>
        <ul className="muted-list">
          <li>{t("sc.w1")}</li>
          <li>{t("sc.w2")}</li>
          <li>{t("sc.w3")}</li>
          <li>{t("sc.w4")}</li>
        </ul>
      </div>
    </>
  );
}

// Easter egg: a little parade of capybaras tumbling down the window. 🦫
function capybaraParade() {
  for (let i = 0; i < 16; i++) {
    const c = document.createElement("div");
    c.className = "capy-egg";
    c.textContent = "🦫";
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDelay = Math.random() * 0.9 + "s";
    c.style.fontSize = 18 + Math.random() * 24 + "px";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

function About({ version }) {
  const [status, setStatus] = useState("idle"); // idle|checking|none|available|downloading|error
  const [update, setUpdate] = useState(null);
  const [pct, setPct] = useState(0);

  const check = async () => {
    setStatus("checking");
    const u = await checkForUpdate();
    if (u) {
      setUpdate(u);
      setStatus("available");
    } else {
      setStatus("none");
    }
  };
  const install = async () => {
    setStatus("downloading");
    try {
      await installUpdate(update, (p) => setPct(p.pct || 0));
    } catch (e) {
      logMessage("error", `update install: ${e}`);
      setStatus("error");
    }
  };

  const [eggs, setEggs] = useState(0);
  const partying = eggs >= 5;
  const bumpEgg = () => {
    setEggs((e) => {
      const n = e + 1;
      if (n === 5) capybaraParade();
      return n;
    });
  };

  return (
    <>
      <h1>{t("ab.title")}</h1>
      <div className="s-about">
        <img
          className={"s-about-logo" + (partying ? " spin" : "")}
          src="/brand/svg/isotype.svg"
          alt="Booki"
          title={eggs > 0 && eggs < 5 ? "🦫".repeat(eggs) : "Booki"}
          onClick={bumpEgg}
        />
        <div>
          <strong>Booki Dock</strong> <span className="s-ver">v{version}</span>{" "}
          <span className="s-beta">BETA</span>
          <p className="muted" style={{ marginTop: 4 }}>{t("ab.tagline")}</p>
        </div>
      </div>

      <div className="s-credits">
        <button className="s-link" onClick={() => dockApi.launch("https://github.com/punkable")}>
          {t("ab.by")} <strong>Punkable</strong> · GitHub ↗
        </button>
        <button className="s-link" onClick={() => dockApi.launch("https://x.com/Punkabl3")}>
          <strong>@Punkabl3</strong> · X ↗
        </button>
      </div>
      {partying && <p className="s-egg">🦫 {t("ab.egg")} 🦫</p>}

      <div className="s-card-inner">
        <h3>{t("ab.updates")}</h3>
        {status === "available" ? (
          <div className="upd-row">
            <span>{t("ab.newVersion")} <strong>v{update.version}</strong> {t("ab.available")}</span>
            <button className="s-btn" onClick={install}>{t("ab.install")}</button>
          </div>
        ) : status === "downloading" ? (
          <div className="upd-row">
            <span>{t("ab.downloading")} {Math.round(pct * 100)}%</span>
            <div className="upd-bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          </div>
        ) : (
          <div className="upd-row">
            <button className="s-btn s-btn-soft" onClick={check} disabled={status === "checking"}>
              {status === "checking" ? t("ab.checking") : t("ab.check")}
            </button>
            {status === "none" && <span className="muted">{t("ab.upToDate")}</span>}
            {status === "error" && <span className="muted">{t("ab.error")}</span>}
          </div>
        )}
        <p className="muted" style={{ marginTop: 8 }}>{t("ab.keeps")}</p>
      </div>

      <p className="muted" style={{ marginTop: 14 }}>{t("ab.made")}</p>
    </>
  );
}

// ── App shell ──

function App() {
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("appearance");
  const [version, setVersion] = useState("0.1.0");
  const [showChangelog, setShowChangelog] = useState(
    typeof location !== "undefined" && location.hash === "#changelog"
  );
  const saveTimer = useRef(null);

  // Show "What's new" when the dock asks us to (first run after an update).
  useEffect(() => {
    let un;
    onShowChangelog(() => setShowChangelog(true)).then((u) => (un = u));
    return () => un && un();
  }, []);

  useEffect(() => {
    configApi.get().then((c) => {
      setLang(c.language);
      setCfg(c);
      applyTheme(c);
    });
    dockApi.appVersion().then(setVersion);
  }, []);

  const set = (patch) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      setLang(next.language);
      applyTheme(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await configApi.save(next);
        await emitConfigChanged();
      }, 120);
      return next;
    });
  };

  const reset = async () => {
    const fresh = await configApi.reset();
    if (fresh) {
      setCfg(fresh);
      applyTheme(fresh);
      await emitConfigChanged();
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Escape closes the changelog modal first, then the window.
      if (showChangelog) setShowChangelog(false);
      else closeSelf();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showChangelog]);

  // Reflect changes made from the dock itself (e.g. drag-reorder or creating a
  // folder) into the Apps list here. We only sync `pinned` so a slider being
  // dragged in Settings isn't clobbered.
  useEffect(() => {
    let un;
    onConfigChanged(() => {
      configApi.get().then((c) =>
        setCfg((prev) => (prev ? { ...prev, pinned: c.pinned } : c))
      );
    }).then((u) => (un = u));
    return () => un && un();
  }, []);

  if (!cfg) return <div className="loading">…</div>;

  return (
    <div className="s-shell">
      <aside className="s-sidebar">
        <div className="s-brand">
          <img src="/brand/svg/isotype.svg" alt="" />
          <span>Booki</span>
        </div>
        <nav style={{ "--active": Math.max(0, TABS.findIndex(([id]) => id === tab)) }}>
          <span className="s-nav-indicator" aria-hidden="true" />
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={"s-navitem" + (tab === id ? " active" : "")}
              onClick={() => setTab(id)}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="s-sidebar-foot">
          <button className="s-btn s-btn-soft" onClick={reset}>{t("act.reset")}</button>
          <button className="s-btn s-btn-ghost" onClick={() => dockApi.quit()}>{t("act.quit")}</button>
        </div>
      </aside>
      <main className="s-content">
        {tab === "appearance" && <Appearance cfg={cfg} set={set} />}
        {tab === "behavior" && <Behavior cfg={cfg} set={set} />}
        {tab === "apps" && <Apps cfg={cfg} set={set} />}
        {tab === "shortcuts" && <Shortcuts cfg={cfg} set={set} />}
        {tab === "about" && <About version={version} />}
      </main>
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </div>
  );
}

// "What's new" shown as a modal inside Settings (no fragile extra window).
function ChangelogModal({ onClose }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal cl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>🦫 {t("cl.title")}</strong>
          <button className="pin-btn ico" onClick={onClose} dangerouslySetInnerHTML={{ __html: icon("x") }} />
        </div>
        <div className="cl-list">
          {CHANGELOG.map((entry, idx) => (
            <section key={entry.version} className={"cl-entry" + (idx === 0 ? " latest" : "")}>
              <div className="cl-entry-head">
                <span className="cl-ver">v{entry.version}</span>
                {idx === 0 && <span className="cl-new">{t("cl.new")}</span>}
                <span className="cl-date">{entry.date}</span>
              </div>
              {entry.headline && <p className="cl-headline">{entry.headline}</p>}
              {entry.sections.map((sec, k) => (
                <div key={k} className="cl-section">
                  <h3 className="cl-section-title"><span className="cl-ico">{sec.icon}</span>{sec.title}</h3>
                  <ul className="cl-notes">
                    {sec.notes.map((n, j) => <li key={j}>{n}</li>)}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="cl-foot">
          <span className="cl-credit">{t("cl.by")} Punkable · @Punkabl3</span>
          <button className="s-btn" onClick={onClose}>{t("cl.ok")}</button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
