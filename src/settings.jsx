/* Booki Dock — Settings (React). Modern sidebar + tabbed panels.
   Shares the config bridge in api.js; changes apply to the dock live. */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
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
  onShowTab,
  closeSelf,
  logMessage,
} from "./api.js";
import { CHANGELOG } from "./changelog-data.js";
import { emoSrc } from "./emoji.js";
import {
  ArrowUndo24Regular,
  Flash24Regular,
  Info24Regular,
  Search24Regular,
} from "@fluentui/react-icons";

const CHANGELOG_ICONS = {
  search: Search24Regular,
  undo: ArrowUndo24Regular,
  performance: Flash24Regular,
};

function ChangelogIcon({ name }) {
  const FluentIcon = CHANGELOG_ICONS[name] || Info24Regular;
  return (
    <span className="cl-ico" aria-hidden="true">
      <FluentIcon />
    </span>
  );
}

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
import { t, setLang, ensureLang } from "./i18n.js";
import { icon } from "./icons.js";

// Small icon button used across the Apps list.
function IconBtn({ name, title, onClick, danger, onPointerDown }) {
  return (
    <button
      type="button"
      className={"pin-btn ico" + (danger ? " del" : "")}
      title={title}
      aria-label={title}
      data-action-label={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className="pin-btn-icon" dangerouslySetInnerHTML={{ __html: icon(name) }} />
    </button>
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

// Searchable option index: i18n key → tab that hosts it (settings search).
const SEARCH_INDEX = [
  ["ap.theme", "appearance"], ["ap.accent", "appearance"], ["ap.presets", "appearance"],
  ["ap.iconSize", "appearance"], ["ap.spacing", "appearance"], ["ap.radius", "appearance"],
  ["ap.translucency", "appearance"], ["ap.language", "general"], ["ap.backup", "general"],
  ["be.position", "behavior"], ["be.autoHide", "behavior"], ["be.hideDelay", "behavior"], ["be.edgeGap", "behavior"],
  ["be.notchPeek", "behavior"], ["be.reveal", "behavior"], ["prof.title", "behavior"],
  ["be.magnify", "behavior"],
  ["be.zoom", "behavior"], ["be.anim", "behavior"], ["be.monitor", "behavior"],
  ["be.showLabels", "behavior"], ["be.showIndicators", "behavior"],
  ["be.autostart", "general"],
  ["apps.title", "apps"], ["apps.widgets", "apps"], ["apps.web", "apps"],
  ["w.mediaScrollVolume", "apps"],
  ["clip.memory", "apps"], ["clip.retention", "apps"], ["clip.limit", "apps"],
  ["clip.sensitive", "apps"], ["clip.compact", "apps"],
  ["gen.captureVisible", "general"],
  ["apps.addTrash", "apps"], ["apps.suggest", "apps"], ["trash.name", "apps"],
  ["sc.title", "general"], ["sc.global", "general"], ["sc.positions", "general"],
  ["faq.title", "faq"], ["faq.q.data", "faq"], ["faq.q.updates", "faq"],
  ["faq.q.smartscreen", "faq"], ["faq.q.uninstall", "faq"], ["faq.transparency", "faq"],
  ["ab.updates", "general"], ["ab.whatsNew", "general"],
];

const SEARCH_ALIASES = {
  "ap.theme": "tema theme claro oscuro light dark modo mode",
  "ap.accent": "color colour acento accent fondo wallpaper",
  "be.autoHide": "ocultar esconder auto hide hidden",
  "be.position": "posicion position borde edge arriba abajo izquierda derecha",
  "be.magnify": "zoom ampliar enlargement magnify",
  "apps.title": "aplicaciones programas pinned apps ancladas",
  "apps.widgets": "widget reloj cpu ram bateria media musica",
  "clip.memory": "portapapeles clipboard privacidad privacy historial history",
  "sc.title": "atajo shortcut hotkey teclado keyboard",
  "prof.title": "perfil profile configuracion setup",
  "gen.backup": "respaldo backup exportar importar export import",
};

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function fuzzySearchScore(text, term) {
  let cursor = 0;
  let gaps = 0;
  for (const char of term) {
    const next = text.indexOf(char, cursor);
    if (next < 0) return 0;
    gaps += next - cursor;
    cursor = next + 1;
  }
  return Math.max(1, 22 - gaps);
}

function findSettings(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return SEARCH_INDEX
    .map(([key, tab]) => {
      const label = t(key);
      const tabLabel = t(`tab.${tab}`);
      const normalizedLabel = normalizeSearchText(label);
      const searchable = `${normalizedLabel} ${normalizeSearchText(tabLabel)} ${normalizeSearchText(SEARCH_ALIASES[key])}`;
      let score = normalizedLabel === normalizedQuery ? 200 : normalizedLabel.startsWith(normalizedQuery) ? 140 : 0;
      for (const term of terms) {
        const position = searchable.indexOf(term);
        const termScore = position >= 0 ? 70 - Math.min(position, 45) : fuzzySearchScore(searchable, term);
        if (!termScore) return null;
        score += termScore;
      }
      return { key, tab, label, tabLabel, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 8);
}

const TABS = [
  ["general", "tab.general", "sliders"],
  ["appearance", "tab.appearance", "palette"],
  ["behavior", "tab.behavior", "settings"],
  ["apps", "tab.apps", "grid"],
  ["faq", "tab.faq", "help"],
  ["about", "tab.about", "info"],
];

const WIDGET_ORDER = ["clock", "cpu", "ram", "disk", "net", "uptime", "battery", "notes", "media", "volume", "clipboard"];
const WIDGET_META = {
  clock: { emoji: "clock", accent: "#dfaa75", desc: "widget.clockDesc", caps: ["widget.cap.live", "widget.cap.clean"] },
  cpu: { emoji: "brain", accent: "#fb8b24", desc: "widget.cpuDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  ram: { emoji: "ice", accent: "#3a86ff", desc: "widget.ramDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  disk: { emoji: "floppy", accent: "#8338ec", desc: "widget.diskDesc", caps: ["widget.cap.live", "widget.cap.ring"] },
  net: { emoji: "antenna", accent: "#06b6d4", desc: "widget.netDesc", caps: ["widget.cap.live", "widget.cap.compact"] },
  uptime: { emoji: "stopwatch", accent: "#2bb673", desc: "widget.uptimeDesc", caps: ["widget.cap.live", "widget.cap.clean"] },
  battery: { emoji: "battery", accent: "#2ecc71", desc: "widget.batteryDesc", caps: ["widget.cap.live", "widget.cap.warning"] },
  notes: { emoji: "memo", accent: "#ffbe0b", desc: "widget.notesDesc", caps: ["widget.cap.editable", "widget.cap.preview"] },
  media: { emoji: "notes", accent: "#ff006e", desc: "widget.mediaDesc", caps: ["widget.cap.controls", "widget.cap.smart"] },
  volume: { emoji: "speaker", accent: "#06b6d4", desc: "widget.volumeDesc", caps: ["widget.cap.scroll", "widget.cap.ring"] },
  clipboard: { emoji: "clipboard", accent: "#7c3aed", desc: "widget.clipboardDesc", caps: ["widget.cap.private", "widget.cap.search"] },
};

function widgetDisplayName(widget) {
  return (
    {
      clock: t("w.clock"),
      cpu: "CPU",
      ram: "RAM",
      disk: t("w.disk"),
      net: t("w.net"),
      uptime: t("w.uptime"),
      battery: t("w.battery"),
      notes: t("w.notes"),
      media: t("w.media"),
      volume: t("w.volume"),
      clipboard: t("w.clipboard"),
    }[widget] || widget
  );
}

function widgetRefs(pinned, widget) {
  const refs = [];
  (pinned || []).forEach((item, i) => {
    if (item.kind === "widget" && item.widget === widget) refs.push({ type: "top", id: item.id, i });
    (item.children || []).forEach((child) => {
      if (child.kind === "widget" && child.widget === widget) refs.push({ type: "child", groupId: item.id, gi: i, id: child.id });
    });
  });
  return refs;
}

function itemForWidgetRef(pinned, ref) {
  if (!ref) return null;
  if (ref.type === "top") {
    return (pinned || []).find((item) => item.id === ref.id) || pinned?.[ref.i] || null;
  }
  const group = (pinned || []).find((item) => item.id === ref.groupId) || pinned?.[ref.gi];
  return (group?.children || []).find((child) => child.id === ref.id) || null;
}

function updateWidgetStyleForRef(pinned, ref, value) {
  if (!ref) return pinned;
  if (ref.type === "top") {
    return pinned.map((item, i) => (item.id === ref.id || (!ref.id && i === ref.i) ? { ...item, style: value } : item));
  }
  return pinned.map((item, i) =>
    item.id === ref.groupId || (!ref.groupId && i === ref.gi)
      ? { ...item, children: (item.children || []).map((child) => (child.id === ref.id ? { ...child, style: value } : child)) }
      : item
  );
}

// Scan the Start Menu once per settings session, then reuse — the scan +
// icon extraction is costly and the Apps panel remounts on every tab switch.
let _installedApps = null;
function installedAppsOnce(force = false) {
  if (force || !_installedApps) {
    _installedApps = dockApi.listInstalledApps().catch(() => {
      _installedApps = null;
      return [];
    });
  }
  return _installedApps;
}

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

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="r-toggle">
      <span className="r-toggle-text">
        {label}
        {hint ? <small className="r-toggle-hint">{hint}</small> : null}
      </span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="r-switch" />
    </label>
  );
}

function PageHeader({ icon: iconName, title, children, meta }) {
  return (
    <header className="settings-page-head">
      <div className="settings-page-title">
        <span className="settings-page-icon" dangerouslySetInnerHTML={{ __html: icon(iconName) }} />
        <div>
          <h1>{title}</h1>
          {children ? <p className="settings-page-copy">{children}</p> : null}
        </div>
      </div>
      {meta ? <div className="settings-page-meta">{meta}</div> : null}
    </header>
  );
}

function SettingsSection({ title, icon: iconName = "settings", hint, children, className = "" }) {
  return (
    <section className={"settings-section " + className}>
      <div className="settings-section-head">
        <span className="settings-section-icon" dangerouslySetInnerHTML={{ __html: icon(iconName) }} />
        <div>
          <h2>{title}</h2>
          {hint ? <p>{hint}</p> : null}
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function CollapsibleSection({ title, icon: iconName = "settings", hint, count, defaultOpen = false, children, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={"settings-section settings-collapsible " + className + (open ? " open" : "")}>
      <button
        type="button"
        className="settings-collapse-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="settings-section-icon" dangerouslySetInnerHTML={{ __html: icon(iconName) }} />
        <span className="settings-collapse-copy">
          <strong>{title}</strong>
          {hint ? <small>{hint}</small> : null}
        </span>
        {count != null ? <span className="settings-count">{count}</span> : null}
        <span className="settings-collapse-chev" dangerouslySetInnerHTML={{ __html: icon(open ? "chevron-down" : "chevron-right") }} />
      </button>
      {open ? <div className="settings-section-body settings-collapse-body">{children}</div> : null}
    </section>
  );
}

function HelpTip({ text }) {
  return (
    <button type="button" className="help-dot" title={text} aria-label={text}>
      <span dangerouslySetInnerHTML={{ __html: icon("help") }} />
    </button>
  );
}

function useModalControls(onClose) {
  useEffect(() => {
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  // Keyboard focus: move it INTO the dialog on open, keep Tab cycling inside
  // (aria-modal alone doesn't trap anything), and give it back on close.
  useEffect(() => {
    const prevFocus = document.activeElement;
    const modals = document.querySelectorAll(".modal");
    const modal = modals[modals.length - 1]; // this hook's dialog is the topmost
    if (!modal) return;
    modal.tabIndex = -1;
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(modal.querySelectorAll(sel)).filter((el) => !el.disabled && el.offsetParent !== null);
    (focusables()[0] || modal).focus();
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const all = document.querySelectorAll(".modal");
      if (all[all.length - 1] !== modal) return; // a newer dialog is on top
      const list = focusables();
      if (!list.length) { e.preventDefault(); modal.focus(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
    };
  }, []);
}

function SectionTitle({ children, name = "settings" }) {
  return (
    <h2 className="s-subhead">
      <span className="s-subhead-icon" dangerouslySetInnerHTML={{ __html: icon(name) }} />
      <span>{children}</span>
    </h2>
  );
}

function Slider({ value, min, max, step, onChange, fmt }) {
  const pct = Math.min(100, Math.max(0, max > min ? ((value - min) / (max - min)) * 100 : 0));
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

// ONE control for position. The dock and its notch always live on the SAME
// edge — so clicking an edge band OR a notch tab moves the DOCK there (the
// notch just picks its spot along that edge). No more "notch on a lonely other
// edge" that used to drift the dock to the wrong place.
function PositionPicker({ cfg, set }) {
  const dockEdge = cfg.edge || "bottom";
  const pos = cfg.notchPosition || "center";
  const showNotch = (cfg.autoHideMode || "smart") !== "off";
  // A notch tab sets the dock's edge AND the notch's along-position at once.
  const pickNotch = (edge, position) => {
    const moved = edge !== dockEdge;
    set({ edge, notchPosition: position, notchEdge: "auto" });
    // Same edge → the dock won't move, so flash the notch to show the new spot.
    // Different edge → reloadConfig already previews the dock on its new edge.
    if (!moved) dockApi.notchPreview();
  };
  const tiles = Math.max(3, Math.min(6, (cfg.pinned || []).filter((p) => p.kind !== "separator").length || 5));
  const posLabel = (s) => t(`be.notch${s[0].toUpperCase()}${s.slice(1)}`);
  return (
    <div className="pospick">
      <div className="pospick-screen">
        {["top", "bottom", "left", "right"].map((e) => (
          <button
            key={e}
            type="button"
            className={`pospick-edge pp-${e}` + (dockEdge === e ? " active" : "")}
            onClick={() => set({ edge: e, notchEdge: "auto" })}
            title={`${t("be.moveDock")}: ${t(`edge.${e}`)}`}
            aria-label={`${t("be.moveDock")}: ${t(`edge.${e}`)}`}
          />
        ))}
        {/* The dock itself, in miniature, living on its edge. */}
        <span key={dockEdge} className={`pospick-bar ppb-${dockEdge}`} aria-hidden="true">
          {Array.from({ length: tiles }).map((_, i) => <i key={i} />)}
        </span>
        {showNotch &&
          ["top", "bottom", "left", "right"].flatMap((edge) =>
            ["start", "center", "end"].map((s) => (
              <button
                key={`${edge}-${s}`}
                type="button"
                className={
                  `notchpick-slot npe-${edge} nps-${s}` +
                  (dockEdge === edge && pos === s ? " active" : "")
                }
                onClick={() => pickNotch(edge, s)}
                title={`${t("be.moveDock")}: ${t(`edge.${edge}`)} · ${posLabel(s)}`}
              >
                <span className="notchpick-tab" />
              </button>
            ))
          )}
      </div>
      <p className="pospick-caption">
        Dock: <strong>{t(`edge.${dockEdge}`)}</strong>
        {showNotch && (
          <>
            {" · "}Notch: <strong>{posLabel(pos)}</strong>
          </>
        )}
      </p>
    </div>
  );
}

// Saved dock profiles: whole-config snapshots you switch between in one click.
function ProfilesCard({ cfg, set }) {
  const [profiles, setProfiles] = useState([]);
  const [name, setName] = useState("");
  // Deleting a saved snapshot is irreversible: arm on first click (auto-disarms)
  // and only delete on an explicit second click — same forgiveness model as
  // "clear all pins" and factory reset.
  const [delArm, setDelArm] = useState("");
  useEffect(() => {
    if (!delArm) return;
    const id = setTimeout(() => setDelArm(""), 3500);
    return () => clearTimeout(id);
  }, [delArm]);
  const refresh = () => dockApi.profileList().then((p) => setProfiles(p || []));
  useEffect(() => {
    refresh();
  }, []);
  const active = (cfg && cfg.lastProfile) || "";
  return (
    <SettingsSection title={t("prof.title")} icon="copy" hint={t("prof.hint")} className="profiles-section">
      {profiles.map((n) => (
        <div key={n} className={"prof-row" + (n === active ? " prof-active" : "")}>
          <span className="prof-name">
            {n === active && <span className="prof-check">✓</span>}
            {n}
          </span>
          <button
            className="s-btn s-btn-soft"
            onClick={async () => {
              const fresh = await dockApi.profileApply(n).catch(() => null);
              if (fresh) set(fresh);
            }}
          >
            {t("prof.apply")}
          </button>
          <button
            className={"s-btn " + (delArm === n ? "s-btn-danger" : "s-btn-soft")}
            title={delArm === n ? t("prof.deleteConfirm") : t("apps.remove")}
            onClick={async () => {
              if (delArm !== n) return setDelArm(n);
              setDelArm("");
              await dockApi.profileDelete(n).catch(() => {});
              refresh();
            }}
          >
            {delArm === n ? t("prof.deleteConfirm") : "×"}
          </button>
        </div>
      ))}
      <div className="prof-row prof-new">
        <input
          className="sugg-search"
          placeholder={t("prof.name")}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="s-btn"
          disabled={!name.trim()}
          onClick={async () => {
            await dockApi.profileSave(name.trim()).catch(() => {});
            setName("");
            refresh();
          }}
        >
          {t("prof.save")}
        </button>
      </div>
    </SettingsSection>
  );
}

// Notch style chips: little live previews of each finish.
const NOTCH_STYLES = ["island", "liquid", "mica", "acrylic", "windows"];
function NotchStylePicker({ cfg, set }) {
  const cur = cfg.notchStyle || "island";
  return (
    <div className="nstyle-row">
      {NOTCH_STYLES.map((s) => (
        <button key={s} type="button"
          className={"nstyle-chip" + (cur === s ? " active" : "")}
          onClick={() => {
            set({ notchStyle: s });
            dockApi.notchPreview(); // show the real notch with the new finish
          }}
          title={t(`nstyle.${s}`)}>
          <span className={`nstyle-pill ns-${s}`} />
          <span className="nstyle-name">{t(`nstyle.${s}`)}</span>
        </button>
      ))}
    </div>
  );
}

// Compose the position-hotkey modifier from Ctrl/Alt/Shift/Win chips.
function ModifierPicker({ cfg, set }) {
  const cur = (cfg.hotkeyModifier || "Alt").split("+");
  const KEYS = ["Ctrl", "Alt", "Shift", "Super"];
  const LABEL = { Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win" };
  const toggle = (k) => {
    let next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    if (!next.length) next = ["Alt"]; // at least one modifier always
    const ordered = KEYS.filter((x) => next.includes(x)).join("+");
    set({ hotkeyModifier: ordered });
    dockApi.applyHotkeys(cfg.hotkey || "", cfg.positionHotkeys !== false, ordered);
  };
  return (
    <div className="mod-row">
      {KEYS.map((k) => (
        <button key={k} type="button"
          className={"mod-chip" + (cur.includes(k) ? " active" : "")}
          onClick={() => toggle(k)}>
          {LABEL[k]}
        </button>
      ))}
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
          className="accent-src"
          title={t("ap.system")}
          onClick={async () => {
            const hex = await dockApi.systemAccent();
            if (hex) onChange(hex);
          }}
        >
          <span className="accent-src-dot" />
          {t("ap.systemShort")}
        </button>
        <button
          type="button"
          className="accent-src"
          title={t("ap.wallpaper")}
          onClick={async () => {
            const hex = await dockApi.wallpaperAccent().catch(() => null);
            if (hex) onChange(hex);
          }}
        >
          <img className="emo" src={emoSrc("picture")} alt="" width="15" height="15" />
          {t("ap.wallpaperShort")}
        </button>
      </div>
      <span className="accent-hex">{(value || "").toUpperCase()}</span>
    </div>
  );
}

function AccentPickerEnhanced({ value, onChange }) {
  const v = (value || "").toLowerCase();
  const isPreset = ACCENTS.some(([, val]) => val.toLowerCase() === v);
  return (
    <div className="accent-picker accent-picker-enhanced">
      <div className="accent-swatches">
        {ACCENTS.map(([name, val]) => (
          <button
            key={val}
            type="button"
            className={"accent-sw" + (v === val.toLowerCase() ? " active" : "")}
            style={{ "--sw": val }}
            title={name}
            aria-label={name}
            onClick={() => onChange(val)}
          >
            <span className="accent-dot" />
            <span className="accent-name">{name}</span>
            <span className="accent-check" dangerouslySetInnerHTML={{ __html: icon("check") }} />
          </button>
        ))}
        <label
          className={"accent-custom" + (!isPreset ? " active" : "")}
          style={{ "--sw": value }}
          title={t("ap.custom")}
          aria-label={t("ap.custom")}
        >
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <span className="accent-dot" />
          <span className="accent-name">{t("ap.custom")}</span>
          <span className="accent-plus" dangerouslySetInnerHTML={{ __html: icon(isPreset ? "plus" : "check") }} />
        </label>
        <button
          type="button"
          className="accent-src"
          title={t("ap.system")}
          onClick={async () => {
            const hex = await dockApi.systemAccent();
            if (hex) onChange(hex);
          }}
        >
          <span className="accent-src-dot" />
          {t("ap.systemShort")}
        </button>
        <button
          type="button"
          className="accent-src"
          title={t("ap.wallpaper")}
          onClick={async () => {
            const hex = await dockApi.wallpaperAccent().catch(() => null);
            if (hex) onChange(hex);
          }}
        >
          <img className="emo" src={emoSrc("picture")} alt="" width="15" height="15" />
          {t("ap.wallpaperShort")}
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
  const [refreshing, setRefreshing] = useState(false);
  const [openGroups, setOpenGroups] = useState({}); // collapsed by default
  const [kf, setKf] = useState([]); // the user's important shell folders
  const toggleGroup = (name) => setOpenGroups((o) => ({ ...o, [name]: !o[name] }));
  useEffect(() => {
    // Memoized across tab switches: scanning the Start Menu and extracting every
    // icon is slow, and this panel remounts each time you open the Apps tab.
    installedAppsOnce().then((a) => setGroups(normalizeGroups(a)));
    dockApi.knownFolders().then((v) => setKf(Array.isArray(v) ? v : [])).catch(() => {});
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
  // User folders also answer the search (by their localized name).
  const kfView = ql ? kf.filter(([k]) => t("kf." + k).toLowerCase().includes(ql)) : kf;
  const addKf = (k, p) => {
    if (pinned.has((p || "").toLowerCase())) return;
    set({ pinned: [...cfg.pinned, { id: uid(), name: t("kf." + k), path: p, args: [], kind: "folder" }] });
  };

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
    <CollapsibleSection
      title={t("apps.suggest")}
      icon="search"
      hint={t("apps.suggestHint")}
      count={groups.reduce((n, g) => n + g.items.length, 0)}
      defaultOpen={false}
      className="suggestions-section"
    >
      <div className="suggestions-panel">
      <div className="suggestions-tools">
        <button
          type="button"
          className="s-btn s-btn-soft s-btn-sm"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            const fresh = await installedAppsOnce(true);
            setGroups(normalizeGroups(fresh));
            setRefreshing(false);
          }}
        >
          {refreshing ? "..." : t("apps.refresh")}
        </button>
      </div>
      <div className="sugg-searchwrap">
        <span className="sugg-search-ico" dangerouslySetInnerHTML={{ __html: icon("search") }} />
        <input className="sugg-search" placeholder={t("apps.search")} value={q}
          onChange={(e) => setQ(e.target.value)} />
        {q && (
          <button className="sugg-clear" title={t("apps.clearNo")} onClick={() => setQ("")}>×</button>
        )}
      </div>
      {kfView.length > 0 && (
        <>
          <div className="kf-head">{t("apps.userFolders")}</div>
          <div className="kf-row">
            {kfView.map(([k, p]) => {
              const isP = pinned.has((p || "").toLowerCase());
              return (
                <button key={k} type="button" className={"kf-chip" + (isP ? " pinned" : "")}
                  disabled={isP} title={p} onClick={() => addKf(k, p)}>
                  <span className="kf-ico" dangerouslySetInnerHTML={{ __html: icon("folder") }} />
                  <span>{t("kf." + k)}</span>
                  {!isP && <span className="kf-plus">+</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
      {view.map((g, gi) => {
        const key = g.name || "general-" + gi;
        const open = ql || !!openGroups[key];
        return (
          <div key={key} className="sugg-group">
            {!ql && (
              <div className="sugg-group-head clickable" onClick={() => toggleGroup(key)}>
                <span className="sugg-chevron" dangerouslySetInnerHTML={{ __html: icon(open ? "chevron-down" : "chevron-right") }} />
                <span className="sugg-group-name">{g.name || t("apps.suggestGeneral")}</span>
                <span className="sugg-count">{g.items.length}</span>
                {g.name && g.items.length > 1 && (
                  <button className="sugg-group-add"
                    onClick={(e) => { e.stopPropagation(); addGroup(g); }}>
                    {t("apps.pinFolder")}
                  </button>
                )}
              </div>
            )}
            {open && <div className="sugg-grid">{g.items.map(Tile)}</div>}
          </div>
        );
      })}
      </div>
    </CollapsibleSection>
  );
}

// Accept either the new grouped shape ([{name, items}]) or a legacy flat list.
// Tiny groups (a single app) merge into the general "Apps" bucket, and groups
// come out alphabetized with the general bucket first — tidier to scan.
function normalizeGroups(a) {
  if (!Array.isArray(a)) return [];
  let groups =
    a.length && a[0] && Array.isArray(a[0].items)
      ? a.filter((g) => g.items && g.items.length)
      : a.length
        ? [{ name: "", items: a }]
        : [];
  const general = { name: "", items: [] };
  const real = [];
  for (const g of groups) {
    if (!g.name || g.items.length < 2) general.items.push(...g.items);
    else real.push(g);
  }
  real.sort((x, y) => x.name.localeCompare(y.name));
  general.items.sort((x, y) => x.name.localeCompare(y.name));
  return general.items.length ? [general, ...real] : real;
}

function PinThumb({ item }) {
  const [src, setSrc] = useState(isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon || null);
  useEffect(() => {
    let alive = true;
    if (isLibIcon(item.icon)) {
      setSrc(resolveLibIcon(item.icon));
    } else if (item.icon) {
      setSrc(item.icon);
    } else if (item.path && /\.(png|jpe?g|gif|bmp|webp|ico)$/i.test(item.path)) {
      // Pinned pictures preview their own thumbnail.
      dockApi.imageDataUri(item.path).then((u) => alive && u && setSrc(u));
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
  if (item.kind === "trash") {
    return <span className="pin-thumb folder" dangerouslySetInnerHTML={{ __html: icon("trash") }} />;
  }
  if (item.kind === "widget") {
    return (
      <span className="pin-thumb widget">
        {WIDGET_EMOJI[item.widget]
          ? <img className="emo" src={emoSrc(WIDGET_EMOJI[item.widget])} alt="" width="18" height="18" />
          : "▦"}
      </span>
    );
  }
  return (
    <span className="pin-thumb">
      {src ? <img src={src} alt="" /> : (item.name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

const WIDGET_EMOJI = { clock: "clock", cpu: "brain", ram: "ice", disk: "floppy", net: "antenna", uptime: "stopwatch", battery: "battery", notes: "memo", media: "notes", volume: "speaker", clipboard: "clipboard" };

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
      <PageHeader icon="palette" title={t("ap.title")} />
      <MiniDockPreview cfg={cfg} />

      <SettingsSection title={t("gp.theme")} icon="palette">
      <Row label={t("ap.theme")}>
        <SegmentedControl
          value={cfg.theme || "system"}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: "system", label: t("theme.system") },
            { value: "light", label: t("theme.light"), icon: "☀" },
            { value: "dark", label: t("theme.dark"), icon: "☾" },
            { value: "auto", label: t("theme.auto"), icon: "🕐" },
          ]}
        />
      </Row>
      <Row label={t("ap.accent")} hint={t("ap.accentHint")}>
        <AccentPickerEnhanced value={cfg.accent} onChange={(v) => set({ accent: v })} />
      </Row>
      <Row label={t("ap.presets")} hint={t("ap.presetsHint")}>
        <div className="preset-row">
          {THEME_PRESETS.map((p) => {
            const active =
              (cfg.accent || "").toLowerCase() === p.accent.toLowerCase() &&
              (cfg.theme || "system") === p.theme;
            return (
              <button
                key={p.name}
                type="button"
                className={"preset-chip" + (active ? " active" : "")}
                title={`${p.name} - ${t(`theme.${p.theme}`)}`}
                style={{ "--preset": p.accent }}
                onClick={() => set({ accent: p.accent, theme: p.theme })}
              >
                <span className="preset-preview">
                  <span className="preset-bar" />
                  <span className="preset-tile" />
                  <span className="preset-tile small" />
                </span>
                <span className="preset-copy">
                  <strong>{p.name}</strong>
                  <small>{t(`theme.${p.theme}`)}</small>
                </span>
                <span className="preset-dot" data-theme={p.theme} />
              </button>
            );
          })}
        </div>
      </Row>
      </SettingsSection>

      <SettingsSection title={t("gp.icons")} icon="grid">
      <Row label={t("ap.iconSize")}>
        <Slider value={cfg.iconSize} min={28} max={80} step={4} fmt={(v) => `${v}px`}
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
      <Toggle label={t("ap.compact")} checked={!!cfg.compact}
        onChange={(v) => set({ compact: v })} />
      </SettingsSection>

      <SettingsSection title={t("gp.material")} icon="sliders">
      <Row label={t("ap.translucency")} hint={t("be.materialHint")}>
        <Slider value={cfg.materialStrength ?? 70} min={0} max={100} step={5}
          fmt={(v) => `${v}%`}
          onChange={(v) => { set({ materialStrength: v }); dockApi.setMaterial(v); }} />
      </Row>

      <Row label={t("be.notchStyle")} hint={t("be.notchStyleHint")}>
        <NotchStylePicker cfg={cfg} set={set} />
      </Row>
      </SettingsSection>

    </>
  );
}

function Behavior({ cfg, set }) {
  const [monitors, setMonitors] = useState([]);
  useEffect(() => {
    dockApi.listMonitors().then((m) => setMonitors(m || []));
  }, []);
  return (
    <>
      <PageHeader icon="settings" title={t("be.title")} />

      <SettingsSection title={t("gp.dock")} icon="app">
      <Row label={t("be.position")} hint={t("be.positionHint")}>
        <PositionPicker cfg={cfg} set={set} />
      </Row>
      <Row label={t("be.monitor")}>
        <MonitorPicker value={cfg.monitor} monitors={monitors}
          onChange={(v) => set({ monitor: v })} />
      </Row>
      <Row label={t("be.edgeGap")} hint={t("be.edgeGapHint")}>
        <Slider value={cfg.edgeGap ?? 48} min={8} max={72} step={4}
          fmt={(v) => `${v}px`} onChange={(v) => set({ edgeGap: v })} />
      </Row>
      </SettingsSection>

      <SettingsSection title={t("gp.notch")} icon="eye">
      <Row label={t("be.autoHide")} hint={t("be.autoHideHint")}>
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
          <Toggle label={t("be.notchPeek")} checked={cfg.notchPeek !== false}
            onChange={(v) => { set({ notchPeek: v }); dockApi.notchPreview(); }} />
          <Row label={t("be.reveal")} hint={t("be.revealHint")}>
            <SegmentedControl
              value={cfg.notchTrigger || "click"}
              onChange={(v) => set({ notchTrigger: v })}
              options={[
                { value: "click", label: t("be.revealClick") },
                { value: "hover", label: t("be.revealHover") },
              ]}
            />
          </Row>
          <Row label={t("be.hideDelay")} hint={t("be.hideDelayHint")}>
            <Slider value={cfg.autoHideDelay ?? 650} min={0} max={2500} step={50}
              fmt={(v) => `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 2)} s`} onChange={(v) => set({ autoHideDelay: v })} />
          </Row>
        </>
      )}
      </SettingsSection>

      <SettingsSection title={t("gp.icons")} icon="grid">
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
          <Slider value={Math.min(150, Math.max(110, Math.round((cfg.zoom || 1.25) * 100)))}
            min={110} max={150} step={5}
            fmt={(v) => `${v}%`} onChange={(v) => set({ zoom: v / 100 })} />
        </Row>
      )}
      <Toggle label={t("be.showLabels")} checked={cfg.showLabels}
        onChange={(v) => set({ showLabels: v })} />
      <Toggle label={t("be.showIndicators")} checked={cfg.showIndicators}
        onChange={(v) => set({ showIndicators: v })} />
      <Toggle label={t("be.focusRunning")} hint={t("be.focusRunningHint")}
        checked={!!cfg.focusIfRunning} onChange={(v) => set({ focusIfRunning: v })} />
      </SettingsSection>

      <ProfilesCard cfg={cfg} set={set} />
    </>
  );
}

// Modal to choose a pin's icon: built-in library (with styles), upload an image,
// or reset to the app's real icon.
function IconPickerModal({ item, onPick, onClose }) {
  useModalControls(onClose);
  const [style, setStyle] = useState(isLibIcon(item.icon) ? parseLibIcon(item.icon).style : "badge");
  const colors = currentAccentColors();
  const upload = async () => {
    const path = await pickImageFile();
    if (!path) return;
    const uri = (await dockApi.imageDataUri(path)) || path;
    onPick(uri);
  };
  return createPortal((
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t("icon.title")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t("icon.title")}</strong>
          <button className="pin-btn ico" aria-label={t("stack.close")} onClick={onClose} dangerouslySetInnerHTML={{ __html: icon("x") }} />
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
  ), document.body);
}

function ClipboardSettingsPanel({ cfg, set }) {
  return (
    <div className="clip-policy clip-policy-embedded">
      <div className="clip-policy-head">
        <span className="clip-policy-icon" dangerouslySetInnerHTML={{ __html: icon("shield") }} />
        <div>
          <strong>{t("clip.privacyTitle")}</strong>
          <p>{t("clip.privacyBody")}</p>
        </div>
      </div>
      <Toggle
        label={t("clip.memory")}
        hint={t("clip.memoryHint")}
        checked={!!cfg.clipboardPersist}
        onChange={(v) => set({ clipboardPersist: v })}
      />
      <Toggle
        label={t("clip.sensitive")}
        hint={t("clip.sensitiveHint")}
        checked={cfg.clipboardSensitiveGuard !== false}
        onChange={(v) => set({ clipboardSensitiveGuard: v })}
      />
      <Toggle
        label={t("clip.compact")}
        hint={t("clip.compactHint")}
        checked={!!cfg.clipboardCompact}
        onChange={(v) => set({ clipboardCompact: v })}
      />
      <Row label={t("clip.retention")} hint={t("clip.retentionHint")}>
        <Slider
          value={cfg.clipboardRetentionDays ?? 7}
          min={1}
          max={90}
          step={1}
          fmt={(v) => t("clip.days").replace("{n}", v)}
          onChange={(v) => set({ clipboardRetentionDays: v })}
        />
      </Row>
      <Row label={t("clip.limit")} hint={t("clip.limitHint")}>
        <Slider
          value={cfg.clipboardHistoryLimit ?? 60}
          min={10}
          max={200}
          step={10}
          fmt={(v) => t("clip.items").replace("{n}", v)}
          onChange={(v) => set({ clipboardHistoryLimit: v })}
        />
      </Row>
      <div className="clip-policy-actions">
        <button className="s-btn s-btn-soft" onClick={() => dockApi.clipboardClear()}>
          {t("clip.clear")}
        </button>
      </div>
    </div>
  );
}

// Visually edit a widget's look: variant, accent color, motion and icon.
function WidgetStyleModal({ item, accent, cfg, set, onChange, onClose }) {
  useModalControls(onClose);
  const st = item.style || {};
  const variant = st.variant || "glass";
  const meta = WIDGET_META[item.widget] || { emoji: "puzzle", accent, desc: "widget.defaultDesc" };
  const set1 = (patch) => onChange({ ...st, ...patch });
  return createPortal((
    <div className="modal-scrim modal-scrim-locked">
      <div className="modal widget-modal" role="dialog" aria-modal="true" aria-label={t("w.styleTitle")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t("w.styleTitle")}</strong>
          <button className="pin-btn ico" aria-label={t("stack.close")} onClick={onClose} dangerouslySetInnerHTML={{ __html: icon("x") }} />
        </div>
        <div className="widget-modal-body">
        <div className="widget-modal-hero" style={{ "--widget-accent": meta.accent || accent }}>
          <span className="widget-store-ico">
            <img className="emo" src={emoSrc(meta.emoji)} alt="" width="30" height="30" />
          </span>
          <div>
            <strong>{item.name || widgetDisplayName(item.widget)}</strong>
            <p>{t(meta.desc)}</p>
          </div>
        </div>
        <SectionTitle name="sparkles">{t("w.behavior")}</SectionTitle>
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
        {item.widget === "media" ? (
          <Toggle
            label={t("w.mediaScrollVolume")}
            hint={t("w.mediaScrollVolumeHint")}
            checked={!!st.scrollVolume}
            onChange={(v) => set1({ scrollVolume: v })}
          />
        ) : item.widget === "clipboard" ? (
          <ClipboardSettingsPanel cfg={cfg} set={set} />
        ) : item.widget !== "notes" ? (
          <div className="widget-no-extra">
            <span dangerouslySetInnerHTML={{ __html: icon("sparkles") }} />
            <div>
              <strong>{t("w.smartDefaults")}</strong>
              <p>{t("w.smartDefaultsHint")}</p>
            </div>
          </div>
        ) : null}
        <SectionTitle name="palette">{t("w.appearance")}</SectionTitle>
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
        </div>
        <div className="widget-modal-footer">
          <button className="s-btn" onClick={onClose}>{t("w.done")}</button>
        </div>
      </div>
    </div>
  ), document.body);
}

function WidgetStoreCard({ widget, label, refs, onAdd, onEdit }) {
  const meta = WIDGET_META[widget] || { emoji: "puzzle", accent: "var(--accent)", desc: "widget.defaultDesc", caps: [] };
  const pinned = refs.length > 0;
  return (
    <article className={"widget-store-card" + (pinned ? " pinned" : "")} style={{ "--widget-accent": meta.accent }}>
      <div className="widget-store-top">
        <span className="widget-store-ico">
          <img className="emo" src={emoSrc(meta.emoji)} alt="" width="30" height="30" />
        </span>
        <div className="widget-store-body">
          <strong>{label}</strong>
          <p>{t(meta.desc)}</p>
        </div>
        {pinned && <span className="widget-store-badge">{t("widget.pinned")}</span>}
      </div>
      <div className="widget-store-caps">
        {(meta.caps || []).map((cap) => <span key={cap}>{t(cap)}</span>)}
      </div>
      <button
        type="button"
        className={"s-btn widget-store-btn" + (pinned ? " s-btn-soft" : "")}
        onClick={pinned ? onEdit : onAdd}
      >
        <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon(pinned ? "sliders" : "plus") }} />
        <span>{pinned ? t("widget.edit") : t("widget.add")}</span>
      </button>
    </article>
  );
}

function Apps({ cfg, set }) {
  const listRef = useRef(null);
  const gridRef = useRef(null);
  const moreButtonRef = useRef(null);
  const moreMenuRef = useRef(null);
  const kidMenuRef = useRef(null);
  const pinnedRef = useRef(cfg.pinned);
  pinnedRef.current = cfg.pinned;
  const drag = useRef(null);
  const childDrag = useRef(null);
  const mergeRef = useRef(-1);
  const [mergeInto, setMergeInto] = useState(-1);
  const [iconFor, setIconFor] = useState(-1);
  const [styleFor, setStyleFor] = useState(null);
  const [webUrl, setWebUrl] = useState("");
  const [webName, setWebName] = useState("");
  const [openIds, setOpenIds] = useState({});
  const toggleOpen = (id) => setOpenIds((o) => ({ ...o, [id]: !o[id] }));
  // List vs. grid layout for the pinned items (remembered across sessions).
  const [view, setView] = useState(() => localStorage.getItem("booki.appsView") || "list");
  const pickView = (v) => { setView(v); try { localStorage.setItem("booki.appsView", v); } catch (_) {} };
  // Two-step "remove everything" so a stray click can't wipe the dock.
  const [clearArm, setClearArm] = useState(false);
  const setIcon = (i, value) =>
    set({ pinned: cfg.pinned.map((p, k) => (k === i ? { ...p, icon: value } : p)) });
  const setStyle = (ref, value) =>
    set({ pinned: updateWidgetStyleForRef(cfg.pinned, ref, value) });
  const widgetLabels = Object.fromEntries(WIDGET_ORDER.map((w) => [w, widgetDisplayName(w)]));
  const openWidgetEditor = (widget) => {
    const ref = widgetRefs(cfg.pinned, widget)[0];
    if (ref) setStyleFor(ref);
  };
  const addWebsite = async () => {
    let url = webUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const host = url.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "");
    // A friendlier default name from the domain (e.g. "youtube.com" → "Youtube"),
    // but the optional name field wins if you typed one.
    const nice = host.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
    const name = webName.trim() || nice || host;
    let icon = null;
    try {
      // Favicon is best-effort: if it can't be fetched the pin still works with
      // its initial — never block or warn just because an icon didn't load.
      icon = await dockApi.fetchFavicon(url);
    } catch (_) {}
    set({ pinned: [...cfg.pinned, { id: uid(), name, path: url, args: [], kind: "app", icon }] });
    setWebUrl("");
    setWebName("");
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
        const mergeable = (k) => k === "app" || k === "widget";
        const canMerge = mergeable(dragged.kind) && (mergeable(target.kind) || target.kind === "group");
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
  // Grid version of the drag: same reorder + drop-onto-center-to-group logic,
  // but hit-tested in 2D (cards wrap onto multiple rows).
  const startDragGrid = (i) => (e) => {
    e.preventDefault();
    drag.current = { from: i };
    mergeRef.current = -1;
    setMergeInto(-1);
    const onMove = (ev) => {
      const cards = [...gridRef.current.querySelectorAll(".pin-card")];
      const from = drag.current.from;
      let over = -1;
      for (let k = 0; k < cards.length; k++) {
        const r = cards[k].getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { over = k; break; }
      }
      if (over >= 0 && over !== from) {
        const r = cards[over].getBoundingClientRect();
        const center =
          ev.clientX > r.left + r.width * 0.28 && ev.clientX < r.right - r.width * 0.28 &&
          ev.clientY > r.top + r.height * 0.28 && ev.clientY < r.bottom - r.height * 0.28;
        const dragged = pinnedRef.current[from];
        const target = pinnedRef.current[over];
        const mergeable = (k) => k === "app" || k === "widget";
        const canMerge = mergeable(dragged.kind) && (mergeable(target.kind) || target.kind === "group");
        if (center && canMerge) {
          if (mergeRef.current !== over) { mergeRef.current = over; setMergeInto(over); }
          return;
        }
      }
      if (mergeRef.current !== -1) { mergeRef.current = -1; setMergeInto(-1); }
      if (over >= 0 && over !== from) {
        const p = [...pinnedRef.current];
        const [m] = p.splice(from, 1);
        p.splice(over, 0, m);
        drag.current.from = over;
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
  const remove = (i) => set({ pinned: cfg.pinned.filter((_, k) => k !== i) });
  const clearAll = () => { set({ pinned: [] }); setClearArm(false); };

  // Grid view: drag a group's child SQUARE to reorder it within the group, or
  // drag it out of the group card to take it back onto the dock — no buttons.
  const kidDrag = useRef(null);
  const kidOutRef = useRef(-1);
  const kidTargetRef = useRef(null); // another group id the child is hovering over → move it there
  const [kidOut, setKidOut] = useState(-1);
  const [kidMenu, setKidMenu] = useState(null); // right-click menu on a group child: {gi,id,x,y}
  const openKidMenu = (e, gi, id) => {
    e.preventDefault();
    e.stopPropagation();
    // Text scale and translated labels make fixed menu dimensions unreliable.
    setKidMenu({ gi, id, x: e.clientX, y: e.clientY });
  };
  useLayoutEffect(() => {
    if (!kidMenu || !kidMenuRef.current) return;
    const place = () => {
      const rect = kidMenuRef.current.getBoundingClientRect();
      const pad = 8;
      const x = Math.min(Math.max(pad, kidMenu.x), Math.max(pad, window.innerWidth - rect.width - pad));
      const y = Math.min(Math.max(pad, kidMenu.y), Math.max(pad, window.innerHeight - rect.height - pad));
      setKidMenu((current) => current && (current.x !== x || current.y !== y) ? { ...current, x, y } : current);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [kidMenu]);
  useEffect(() => {
    if (!kidMenu) return;
    kidMenuRef.current?.querySelector("button")?.focus();
    const close = () => setKidMenu(null);
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", onKeyDown); };
  }, [kidMenu]);
  // Move a child from one group to another (dissolving the source if it's left
  // with fewer than 2). Keyed by id so it survives the array shifting.
  const moveChildToGroupById = (fromGroupId, childId, toGroupId) => {
    if (fromGroupId === toGroupId) return;
    const arr = pinnedRef.current;
    const from = arr.find((p) => p.id === fromGroupId);
    if (!from) return;
    const child = (from.children || []).find((c) => c.id === childId);
    if (!child) return;
    const srcKids = (from.children || []).filter((c) => c.id !== childId);
    let next = arr.map((p) => (p.id === toGroupId ? { ...p, children: [...(p.children || []), child] } : p));
    if (srcKids.length < 2) next = next.flatMap((p) => (p.id === fromGroupId ? srcKids : [p]));
    else next = next.map((p) => (p.id === fromGroupId ? { ...p, children: srcKids } : p));
    set({ pinned: next });
  };
  const startKidDrag = (gi, childId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const card = e.currentTarget.closest(".pin-card");
    const srcGroupId = pinnedRef.current[gi].id;
    const startIndex = (pinnedRef.current[gi].children || []).findIndex((c) => c.id === childId);
    kidDrag.current = { gi, id: childId, from: startIndex, srcGroupId };
    kidOutRef.current = -1;
    kidTargetRef.current = null;
    setKidOut(-1);
    setMergeInto(-1);
    const onMove = (ev) => {
      // Over ANOTHER group card → releasing moves the child into that group.
      let overGroup = null;
      for (const gc of gridRef.current.querySelectorAll(".pin-card.is-group")) {
        const idx = +gc.dataset.idx;
        const p = pinnedRef.current[idx];
        if (!p || p.id === srcGroupId) continue;
        const r = gc.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { overGroup = p.id; break; }
      }
      if (overGroup) {
        if (kidTargetRef.current !== overGroup) {
          kidTargetRef.current = overGroup;
          setMergeInto(pinnedRef.current.findIndex((p) => p.id === overGroup));
        }
        if (kidOutRef.current !== -1) { kidOutRef.current = -1; setKidOut(-1); }
        return; // aiming at another group → don't reorder/takeout
      }
      if (kidTargetRef.current !== null) { kidTargetRef.current = null; setMergeInto(-1); }
      const cr = card.getBoundingClientRect();
      const out =
        ev.clientX < cr.left - 8 || ev.clientX > cr.right + 8 ||
        ev.clientY < cr.top - 8 || ev.clientY > cr.bottom + 8;
      if (out) {
        if (kidOutRef.current !== gi) { kidOutRef.current = gi; setKidOut(gi); }
        return; // aiming outside → release will take it out
      }
      if (kidOutRef.current !== -1) { kidOutRef.current = -1; setKidOut(-1); }
      const kids = [...card.querySelectorAll(".pin-kid:not(.pin-kid-add)")];
      let over = -1;
      for (let k = 0; k < kids.length; k++) {
        const r = kids[k].getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { over = k; break; }
      }
      const from = kidDrag.current.from;
      if (over >= 0 && over !== from) {
        const arr = [...(pinnedRef.current[gi].children || [])];
        const [m] = arr.splice(from, 1);
        arr.splice(over, 0, m);
        kidDrag.current.from = over;
        set({ pinned: pinnedRef.current.map((p, k) => (k === gi ? { ...p, children: arr } : p)) });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      if (kidTargetRef.current) moveChildToGroupById(srcGroupId, kidDrag.current.id, kidTargetRef.current);
      else if (kidOutRef.current === gi) takeOutChild(gi, kidDrag.current.id);
      kidTargetRef.current = null;
      kidOutRef.current = -1;
      setKidOut(-1);
      setMergeInto(-1);
      kidDrag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };
  // Flag pins whose target doesn't exist on THIS machine (moved, uninstalled,
  // or config imported from another PC) and offer to reassign the path.
  const [missing, setMissing] = useState({});
  useEffect(() => {
    const items = [];
    for (const p of cfg.pinned) {
      if (p.path && (p.kind === "app" || p.kind === "folder")) items.push([p.id, p.path]);
      for (const c of p.children || []) if (c.path) items.push([c.id, c.path]);
    }
    if (!items.length) {
      setMissing({});
      return;
    }
    let alive = true;
    dockApi
      .pathsExist(items.map(([, pth]) => pth))
      .then((flags) => {
        if (!alive || !Array.isArray(flags)) return;
        const m = {};
        items.forEach(([id], i) => {
          if (!flags[i]) m[id] = true;
        });
        setMissing(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cfg.pinned]);
  const reassign = async (i) => {
    const item = cfg.pinned[i];
    const pth = item.kind === "folder" ? await pickFolder() : await pickAppFile();
    if (pth) set({ pinned: cfg.pinned.map((p, k) => (k === i ? { ...p, path: pth } : p)) });
  };
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
  const hasTrash = cfg.pinned.some((p) => p.kind === "trash");
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState(null);
  useLayoutEffect(() => {
    if (!moreOpen || !moreButtonRef.current || !moreMenuRef.current) return;
    const place = () => {
      const trigger = moreButtonRef.current.getBoundingClientRect();
      const menu = moreMenuRef.current.getBoundingClientRect();
      const pad = 8;
      const gap = 6;
      const left = Math.min(
        Math.max(pad, trigger.right - menu.width),
        Math.max(pad, window.innerWidth - menu.width - pad)
      );
      const below = trigger.bottom + gap;
      const above = trigger.top - menu.height - gap;
      const top = below + menu.height <= window.innerHeight - pad
        ? below
        : Math.max(pad, above);
      setMoreMenuPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [moreOpen]);
  // Close the "more options" dropdown when clicking anywhere else.
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e) => {
      if (!e.target.closest || (!e.target.closest(".s-more") && !e.target.closest(".s-more-menu"))) {
        setMoreOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [moreOpen]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);
  const addTrash = () =>
    !hasTrash &&
    set({ pinned: [...cfg.pinned, { id: uid(), name: t("trash.name"), path: "", args: [], kind: "trash" }] });
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
  const styleTarget = itemForWidgetRef(cfg.pinned, styleFor);
  const widgetPinnedCount = (cfg.pinned || []).reduce(
    (n, item) => n + (item.kind === "widget" ? 1 : 0) + (item.children || []).filter((c) => c.kind === "widget").length,
    0
  );

  return (
    <>
      <PageHeader
        icon="grid"
        title={t("apps.title")}
        meta={(
          <>
            <span>{cfg.pinned.length}</span>
            <span>{widgetPinnedCount} {t("apps.widgets")}</span>
          </>
        )}
      >
        {t("apps.hint")}
      </PageHeader>
      <SettingsSection title={t("apps.title")} icon="app" className="apps-primary-section">
      <div className="pin-toolbar">
        <div className="pin-toolbar-main">
          {cfg.pinned.length > 0 ? (
            <div className="pin-view-toggle" role="tablist" aria-label={t("apps.view")}>
              <button className={"pin-view-btn" + (view === "list" ? " active" : "")}
                title={t("apps.viewList")} aria-label={t("apps.viewList")} aria-selected={view === "list"} onClick={() => pickView("list")}>
                <span dangerouslySetInnerHTML={{ __html: icon("list") }} />
              </button>
              <button className={"pin-view-btn" + (view === "grid" ? " active" : "")}
                title={t("apps.viewGrid")} aria-label={t("apps.viewGrid")} aria-selected={view === "grid"} onClick={() => pickView("grid")}>
                <span dangerouslySetInnerHTML={{ __html: icon("grid") }} />
              </button>
            </div>
          ) : (
            <div className="pin-list-summary">
              <strong>{cfg.pinned.length}</strong>
              <span>{t("apps.title")}</span>
            </div>
          )}
        </div>
        <div className="pin-toolbar-actions">
          <button className="s-btn pin-add-main" onClick={addApp}>
            <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("plus") }} />
            <span>{t("apps.addApp")}</span>
          </button>
          <div className="s-more">
            <button ref={moreButtonRef} className="s-btn s-btn-soft s-btn-ico" title={t("apps.more")}
              aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
              <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("chevron-down") }} />
              <span>{t("apps.more")}</span>
            </button>
            {moreOpen && createPortal(
              <div ref={moreMenuRef} className="s-more-menu" role="menu" aria-label={t("apps.more")}
                style={{ left: moreMenuPos?.left ?? 0, top: moreMenuPos?.top ?? 0, visibility: moreMenuPos ? "visible" : "hidden" }}
                onClick={() => setMoreOpen(false)}>
                <button role="menuitem" onClick={addFolder}>
                  <span dangerouslySetInnerHTML={{ __html: icon("folder-plus") }} />{t("apps.addFolder")}
                </button>
                <button role="menuitem" onClick={newFolder}>
                  <span dangerouslySetInnerHTML={{ __html: icon("folder") }} />{t("apps.newFolder")}
                </button>
                <button role="menuitem" onClick={addSep}>
                  <span dangerouslySetInnerHTML={{ __html: icon("list") }} />{t("apps.addSep")}
                </button>
                <button role="menuitem" onClick={addTrash} disabled={hasTrash} title={t("apps.trashHint")}>
                  <span dangerouslySetInnerHTML={{ __html: icon("trash") }} />{t("apps.addTrash")}
                </button>
              </div>,
              document.body
            )}
          </div>
          {cfg.pinned.length > 0 && (clearArm ? (
            <span className="pin-clear-confirm">
              {t("apps.clearConfirm")}
              <button className="s-btn s-btn-danger s-btn-sm" onClick={clearAll}>{t("apps.clearYes")}</button>
              <button className="s-btn s-btn-soft s-btn-sm" onClick={() => setClearArm(false)}>{t("apps.clearNo")}</button>
            </span>
          ) : (
            <button className="s-btn s-btn-soft s-btn-sm pin-clear" onClick={() => setClearArm(true)}>
              <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("trash") }} />
              <span>{t("apps.clearAll")}</span>
            </button>
          ))}
        </div>
      </div>
      {cfg.pinned.length === 0 && (
        <div className="s-tips">
          <div className="s-tip"><img className="emo" src={emoSrc("mouse")} alt="" width="18" height="18" />{t("apps.tips1")}</div>
          <div className="s-tip"><img className="emo" src={emoSrc("star")} alt="" width="18" height="18" />{t("apps.tips2")}</div>
          <div className="s-tip"><img className="emo" src={emoSrc("puzzle")} alt="" width="18" height="18" />{t("apps.tips3")}</div>
        </div>
      )}
      {view === "grid" && cfg.pinned.length > 0 ? (
        <div className="pin-grid" ref={gridRef}>
          {cfg.pinned.map((item, i) => {
            const isGroup = item.kind === "group";
            const open = isGroup && openIds[item.id];
            return (
              <div key={item.id} data-idx={i}
                className={"pin-card" + (isGroup ? " is-group" : "") + (item.kind === "separator" ? " is-sep" : "") +
                  (mergeInto === i ? " merge-into" : "") + (open ? " open" : "")}>
                <button className="pin-card-grip" title={t("apps.drag")} aria-label={t("apps.drag")}
                  onPointerDown={startDragGrid(i)} dangerouslySetInnerHTML={{ __html: icon("grip") }} />
                <div className={"pin-card-body" + (isGroup ? " clickable" : "")}
                  onClick={isGroup ? () => toggleOpen(item.id) : undefined}
                  title={isGroup ? t("apps.editFolder") : item.path || ""}>
                  {item.kind !== "separator" && <PinThumb item={item} />}
                  <span className="pin-card-name">
                    {item.kind === "separator" ? t("apps.sep") : item.name}
                  </span>
                  {isGroup && <span className="pin-count">{(item.children || []).length}</span>}
                  {missing[item.id] && <span className="pin-missing" title={t("apps.missing")}>⚠</span>}
                </div>
                <div className="pin-card-actions">
                  {isGroup && <IconBtn name="ungroup" title={t("group.ungroup")} onClick={() => ungroup(i)} />}
                  {item.kind === "widget" && <IconBtn name="palette" title={t("w.styleTitle")} onClick={() => setStyleFor({ type: "top", id: item.id, i })} />}
                  {item.kind !== "separator" && item.kind !== "widget" && item.kind !== "trash" && !isGroup && (
                    <IconBtn name="palette" title={t("apps.changeIcon")} onClick={() => setIconFor(i)} />
                  )}
                  <IconBtn name="trash" danger title={t("apps.remove")} onClick={() => remove(i)} />
                </div>
                {open && (
                  <div className={"pin-card-kids" + (kidOut === i ? " taking-out" : "")}>
                    {(item.children || []).map((c) => (
                      <div key={c.id} className="pin-kid" title={t("apps.dragKid")}
                        onPointerDown={startKidDrag(i, c.id)}
                        onContextMenu={(e) => openKidMenu(e, i, c.id)}>
                        <PinThumb item={c} />
                        <span className="pin-kid-name" title={c.path || ""}>{c.name}</span>
                        {c.kind === "widget" && (
                          <button
                            type="button"
                            className="pin-kid-edit"
                            title={t("w.styleTitle")}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setStyleFor({ type: "child", groupId: item.id, gi: i, id: c.id }); }}
                            dangerouslySetInnerHTML={{ __html: icon("sliders") }}
                          />
                        )}
                      </div>
                    ))}
                    <button className="pin-kid pin-kid-add" title={t("apps.addToFolder")}
                      onClick={() => addToFolder(i)}
                      dangerouslySetInnerHTML={{ __html: icon("plus") }} />
                    <div className="pin-kids-hint">{t("apps.kidsHint2")}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <ul className="pin-list" ref={listRef}>
        {cfg.pinned.length === 0 && (
          <li className="pin-empty">
            <img className="empty-capy" src="/brand/svg/isotype.svg" alt="" />
            {t("apps.empty")}
          </li>
        )}
        {cfg.pinned.flatMap((item, i) => {
          const isGroup = item.kind === "group";
          const open = isGroup && openIds[item.id];
          const rows = [
            <li key={item.id} className={"pin-item" + (item.kind === "separator" ? " sep" : "") + (isGroup ? " is-folder" : "") + (mergeInto === i ? " merge-into" : "")}>
              <span className="pin-left">
                <button className="pin-handle" title={t("apps.drag")} aria-label={t("apps.drag")}
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
                {missing[item.id] && (
                  <span className="pin-missing" title={t("apps.missing")}>⚠ {t("apps.missingShort")}</span>
                )}
                {isGroup && <span className="pin-count">{(item.children || []).length}</span>}
              </span>
              <span className="pin-actions">
                {isGroup && <IconBtn name="ungroup" title={t("group.ungroup")} onClick={() => ungroup(i)} />}
                {item.kind === "widget" && <IconBtn name="palette" title={t("w.styleTitle")} onClick={() => setStyleFor({ type: "top", id: item.id, i })} />}
                {item.kind !== "separator" && item.kind !== "widget" && item.kind !== "trash" && !isGroup && (
                  <IconBtn name="palette" title={t("apps.changeIcon")} onClick={() => setIconFor(i)} />
                )}
                {missing[item.id] && (item.kind === "app" || item.kind === "folder") && (
                  <IconBtn name="pencil" title={t("apps.reassign")} onClick={() => reassign(i)} />
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
                    <button className="pin-handle" title={t("apps.drag")} aria-label={t("apps.drag")}
                      onPointerDown={startDragChild(i, ci)} dangerouslySetInnerHTML={{ __html: icon("grip") }} />
                    <PinThumb item={c} />
                    <input
                      className="pin-name-edit"
                      value={c.name}
                      onChange={(e) => renameChild(i, c.id, e.target.value)}
                    />
                  </span>
                  <span className="pin-actions">
                    {c.kind === "widget" && (
                      <IconBtn name="palette" title={t("w.styleTitle")} onClick={() => setStyleFor({ type: "child", groupId: item.id, gi: i, id: c.id })} />
                    )}
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
      )}
      </SettingsSection>
      <CollapsibleSection
        title={t("apps.widgets")}
        icon="sliders"
        hint={t("apps.widgetsHint")}
        count={WIDGET_ORDER.length}
        defaultOpen={false}
      >
        <div className="widget-store-grid">
          {WIDGET_ORDER.map((w) => {
            const refs = widgetRefs(cfg.pinned, w);
            return (
              <WidgetStoreCard
                key={w}
                widget={w}
                label={widgetLabels[w] || w}
                refs={refs}
                onAdd={() => addWidget(w, widgetLabels[w] || w)}
                onEdit={() => openWidgetEditor(w)}
              />
            );
          })}
        </div>
      </CollapsibleSection>
      <SettingsSection title={t("apps.web")} icon="external" hint={t("apps.webHint")}>
      <div className="web-add">
        <input
          className="r-hotkey-input web-url"
          type="text"
          placeholder={t("apps.webPlaceholder")}
          value={webUrl}
          onChange={(e) => setWebUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addWebsite()}
        />
        <input
          className="r-hotkey-input web-name"
          type="text"
          placeholder={t("apps.webName")}
          value={webName}
          onChange={(e) => setWebName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addWebsite()}
        />
        <button className="s-btn" onClick={addWebsite}>{t("apps.webAdd")}</button>
      </div>
      </SettingsSection>
      <Suggestions cfg={cfg} set={set} />
      {iconFor >= 0 && cfg.pinned[iconFor] && (
        <IconPickerModal
          item={cfg.pinned[iconFor]}
          onClose={() => setIconFor(-1)}
          onPick={(value) => { setIcon(iconFor, value); setIconFor(-1); }}
        />
      )}
      {styleTarget && (
        <WidgetStyleModal
          item={styleTarget}
          accent={cfg.accent}
          cfg={cfg}
          set={set}
          onChange={(value) => setStyle(styleFor, value)}
          onClose={() => setStyleFor(null)}
        />
      )}
      {kidMenu && (
        <div ref={kidMenuRef} className="pin-kid-menu" role="menu" aria-label="Acciones del elemento" style={{ left: kidMenu.x, top: kidMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}>
          <button role="menuitem" onClick={() => { takeOutChild(kidMenu.gi, kidMenu.id); setKidMenu(null); }}>
            <span dangerouslySetInnerHTML={{ __html: icon("take-out") }} />{t("group.takeOut")}
          </button>
          <button role="menuitem" className="danger" onClick={() => { removeChild(kidMenu.gi, kidMenu.id); setKidMenu(null); }}>
            <span dangerouslySetInnerHTML={{ __html: icon("trash") }} />{t("apps.remove")}
          </button>
        </div>
      )}
    </>
  );
}

function mkApp(path) {
  const file = String(path).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "App";
  return { id: uid(), name: file.replace(/\.(exe|lnk|bat|cmd)$/i, ""), path, args: [], kind: "app" };
}

// Keyboard shortcuts — a SECTION of the General tab (it never warranted a whole
// tab of its own).
function ShortcutsSection({ cfg, set }) {
  return (
    <>
      <Row label={t("sc.toggle")} hint={t("sc.global")}>
        <HotkeyInput
          value={cfg.hotkey}
          onChange={(v) => {
            set({ hotkey: v });
            dockApi.setHotkey(v);
          }}
        />
      </Row>
      <Toggle label={t("sc.positions")} checked={cfg.positionHotkeys !== false}
        onChange={(v) => {
          set({ positionHotkeys: v });
          dockApi.applyHotkeys(cfg.hotkey || "", v, cfg.hotkeyModifier || "Alt");
        }} />
      {cfg.positionHotkeys !== false && (
        <Row label={t("sc.posMod")} hint={t("sc.posHint").replace("{mod}", (cfg.hotkeyModifier || "Alt").replace("Super", "Win"))}>
          <ModifierPicker cfg={cfg} set={set} />
        </Row>
      )}
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

// Real network logos (official marks, drawn inline so they ship offline).
const BTC_SVG = `<svg viewBox="0 0 32 32" width="30" height="30"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#fff" d="M22.4 14.1c.3-2.1-1.3-3.2-3.5-4l.7-2.8-1.7-.4-.7 2.7c-.45-.11-.91-.22-1.37-.32l.7-2.75-1.7-.43-.7 2.83c-.37-.08-.73-.17-1.08-.26l-2.36-.59-.46 1.83s1.27.29 1.24.31c.69.17.82.63.8.99l-.8 3.22c.05.01.11.03.18.06l-.18-.05-1.13 4.51c-.08.21-.3.53-.78.41.02.02-1.24-.31-1.24-.31l-.85 1.96 2.22.55c.41.11.82.21 1.22.32l-.71 2.86 1.7.43.71-2.84c.47.13.92.24 1.36.35l-.7 2.82 1.7.43.71-2.86c2.92.55 5.11.33 6.03-2.31.75-2.12-.03-3.35-1.57-4.15 1.12-.26 1.96-1 2.18-2.52zm-3.9 5.49c-.53 2.12-4.1.98-5.26.69l.94-3.77c1.16.29 4.87.86 4.32 3.08zm.53-5.52c-.48 1.93-3.45.95-4.42.71l.85-3.42c.96.24 4.07.69 3.57 2.71z"/></svg>`;
const SOL_SVG = `<svg viewBox="0 0 398 312" width="26" height="26"><defs><linearGradient id="solg" x1="360" y1="-40" x2="40" y2="340" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00FFA3"/><stop offset="1" stop-color="#DC1FFF"/></linearGradient></defs><path fill="url(#solg)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7zM64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8zM333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/></svg>`;

const DONATE = [
  { key: "btc", name: "Bitcoin", svg: BTC_SVG,
    addr: "bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3" },
  { key: "sol", name: "Solana", svg: SOL_SVG,
    addr: "JCRkiVEm5sPBNnna1j16CRu5E4VeNWtoj6TThxmVFB4W" },
];

function DonateCard() {
  const [copied, setCopied] = useState("");
  const copy = async (d) => {
    try {
      await navigator.clipboard.writeText(d.addr);
      setCopied(d.key);
      setTimeout(() => setCopied(""), 1600);
    } catch (_) {}
  };
  return (
    <div className="s-card-inner">
      <h3>{t("ab.free")}</h3>
      <p className="muted">{t("ab.freeText")}</p>
      <p className="muted">{t("ab.donateHint")}</p>
      <div className="donate">
        {DONATE.map((d) => (
          <div key={d.key} className="donate-row">
            <span className="donate-ico" dangerouslySetInnerHTML={{ __html: d.svg }} />
            <span className="donate-col">
              <strong>{d.name}</strong>
              {/* Full address, selectable for manual copy/paste; the button is an
                  extra convenience, not the only way. */}
              <code
                className="donate-addr"
                title={t("ab.selectCopy")}
                onClick={(e) => {
                  const r = document.createRange();
                  r.selectNodeContents(e.currentTarget);
                  const sel = window.getSelection();
                  sel.removeAllRanges();
                  sel.addRange(r);
                }}
              >
                {d.addr}
              </code>
            </span>
            <button className="s-btn s-btn-soft" onClick={() => copy(d)}>
              {copied === d.key ? t("ab.copied") : t("ab.copy")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reset lives HERE (not next to Quit in the sidebar — too easy to hit by
// accident) and requires a second, explicit click.
function ResetZone({ onReset }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const tm = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(tm);
  }, [armed]);
  return (
    <div className="s-card-inner">
      <h3>{t("ab.danger")}</h3>
      <p className="muted">{t("ab.resetHint")}</p>
      <button
        className={"s-btn " + (armed ? "s-btn-danger" : "s-btn-soft")}
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          onReset();
        }}
      >
        {armed ? t("ab.resetConfirm") : t("act.reset")}
      </button>
    </div>
  );
}

// Transparency / FAQ tab: plain answers about privacy, data, updates and the
// beta, plus the links to see everything for yourself. Content is data-driven so
// it stays translatable; the accordion is native <details> (no extra JS).
function Faq({ version }) {
  const items = ["what", "data", "where", "smartscreen", "updates", "resources", "opensource", "uninstall"];
  const open = (url) => dockApi.launch(url);
  return (
    <>
      <h1>{t("faq.title")}</h1>
      <p className="muted" style={{ marginTop: -4, marginBottom: 14 }}>{t("faq.intro")}</p>

      <div className="faq-list">
        {items.map((k) => (
          <details className="faq-item" key={k}>
            <summary>{t(`faq.q.${k}`)}</summary>
            <p>{t(`faq.a.${k}`)}</p>
          </details>
        ))}
      </div>

      <SectionTitle name="info">{t("faq.transparency")}</SectionTitle>
      <div className="s-card-inner faq-facts">
        <p><strong>{t("faq.fact.dataTitle")}</strong><br />
          <code>%APPDATA%\Booki\config.json</code> — {t("faq.fact.data")}</p>
        <p><strong>{t("faq.fact.netTitle")}</strong><br />{t("faq.fact.net")}</p>
        <p><strong>{t("faq.fact.startupTitle")}</strong><br />
          <code>HKCU\…\Run\Booki</code> — {t("faq.fact.startup")}</p>
      </div>

      <div className="s-credits" style={{ marginTop: 14 }}>
        <button className="s-link" onClick={() => dockApi.openDataDir().catch(() => {})}>
          {t("faq.link.data")}
        </button>
        <button className="s-link" onClick={() => open("https://github.com/punkable/booki")}>
          {t("faq.link.repo")} ↗
        </button>
        <button className="s-link" onClick={() => open("https://github.com/punkable/booki/issues")}>
          {t("faq.link.issues")} ↗
        </button>
        <button className="s-link" onClick={() => open("https://github.com/punkable/booki/blob/main/LICENSE")}>
          {t("faq.link.license")} ↗
        </button>
        <button className="s-link" onClick={() => dockApi.launch("mailto:punkable@protonmail.com")}>
          {t("faq.link.contact")} ↗
        </button>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>{t("faq.contact")} <a className="s-inline-link" href="mailto:punkable@protonmail.com">punkable@protonmail.com</a></p>
      <p className="muted" style={{ marginTop: 4 }}>v{version} · {t("faq.foot")}</p>
    </>
  );
}

// Updates live in the General tab (the dock's "update available" pill opens it),
// so the check + install button is always where you'd look for it.
function UpdatesCard({ onWhatsNew }) {
  const [status, setStatus] = useState("idle"); // idle|checking|none|available|downloading|installing|error
  const [update, setUpdate] = useState(null);
  const [pct, setPct] = useState(0);
  const check = async () => {
    setStatus("checking");
    const u = await checkForUpdate();
    if (u) { setUpdate(u); setStatus("available"); } else { setStatus("none"); }
  };
  // Check on arrival: the pill lands on this tab, so the install button must be
  // waiting — not another "check for updates" click.
  useEffect(() => { check(); }, []);
  const install = async () => {
    setStatus("downloading");
    try {
      await installUpdate(update, (p) => {
        setPct(p.pct || 0);
        if (p.phase === "install") setStatus("installing");
      });
    } catch (e) {
      logMessage("error", `update install: ${e}`);
      setStatus("error");
    }
  };
  return (
    <div className="s-card-inner">
      {status === "available" ? (
        <div className="upd-row">
          <span>{t("ab.newVersion")} <strong>v{update.version}</strong> {t("ab.available")}</span>
          <button className="s-btn" onClick={install}>{t("ab.install")}</button>
        </div>
      ) : status === "downloading" ? (
        <div className="upd-row">
          <span>{t("ab.downloading")} {Math.round(pct * 100)}%</span>
          <div className="upd-bar"><i style={{ transform: `scaleX(${pct.toFixed(3)})` }} /></div>
        </div>
      ) : status === "installing" ? (
        <div className="upd-row">
          <span><img className="emo" src={emoSrc("sparkles")} alt="" width="16" height="16" /> <strong>{t("ab.installing")}</strong></span>
          <div className="upd-bar"><i style={{ transform: "scaleX(1)" }} /></div>
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
      <button className="s-btn s-btn-soft s-btn-ico" style={{ marginTop: 8 }} onClick={onWhatsNew}>
        <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("sparkles") }} />
        <span>{t("ab.whatsNew")}</span>
      </button>
    </div>
  );
}

// The "everything general" tab: system toggles, language, shortcuts, updates
// and backup — anything that isn't about how the dock looks or moves.
function General({ cfg, set, onWhatsNew }) {
  const [autostart, setAutostart] = useState(!!cfg.autostart);
  useEffect(() => {
    dockApi.getAutostart().then((v) => setAutostart(!!v));
  }, []);
  return (
    <>
      <h1>{t("gen.title")}</h1>
      <p className="muted">{t("gen.hint")}</p>

      <SectionTitle name="power">{t("gp.system")}</SectionTitle>
      <Toggle label={t("be.autostart")} checked={autostart}
        onChange={async (v) => {
          setAutostart(v);
          try {
            await dockApi.setAutostart(v);
          } catch (e) {
            console.error("autostart:", e);
          }
          // Trust the registry, not our optimism: re-read and reflect reality.
          const real = !!(await dockApi.getAutostart().catch(() => v));
          setAutostart(real);
          set({ autostart: real });
        }} />
      <div className="capture-row">
        <Toggle label={t("gen.captureVisible")} hint={t("gen.captureVisibleHint")}
          checked={!!cfg.captureVisible}
          onChange={(v) => set({ captureVisible: v })} />
        <HelpTip text={t("gen.captureHelp")} />
      </div>
      <Toggle label={t("gen.ctxMenu")} hint={t("gen.ctxMenuHint")}
        checked={cfg.contextMenu !== false}
        onChange={(v) => set({ contextMenu: v })} />

      <SectionTitle name="sparkles">{t("ab.updates")}</SectionTitle>
      <UpdatesCard onWhatsNew={onWhatsNew} />

      <SectionTitle name="keyboard">{t("sc.title")}</SectionTitle>
      <ShortcutsSection cfg={cfg} set={set} />

      <SectionTitle name="help">{t("gen.langSub")}</SectionTitle>
      <Row label={t("ap.language")} hint={t("gen.langHint")}>
        <select className="s-select" value={cfg.language || "system"}
          onChange={(e) => set({ language: e.target.value })}>
          <option value="system">{t("lang.system")}</option>
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="pt">Português</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </Row>

      <SectionTitle name="copy">{t("ap.backup")}</SectionTitle>
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

function About({ version, onWhatsNew, onReset }) {
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
          <span className="s-about-word">
            <img className="brand-word word-black" src="/brand/svg/logoonlytextblack.svg" alt="Booki" />
            <img className="brand-word word-white" src="/brand/svg/logoonlytextwhite.svg" alt="Booki" />
          </span>{" "}
          <span className="s-ver">v{version}</span>{" "}
          <span className="s-beta">BETA</span>
          <p className="muted" style={{ marginTop: 4 }}>{t("ab.tagline")}</p>
        </div>
      </div>

      <div className="s-credits">
        <button className="s-link" onClick={() => dockApi.launch("https://github.com/punkable")}>
          {t("ab.by")} <strong>Punkable</strong> · GitHub ↗
        </button>
        <button className="s-link" onClick={() => dockApi.launch("https://x.com/0xPunki")}>
          <strong>@0xPunki</strong> · X ↗
        </button>
        <button className="s-link" onClick={() => dockApi.launch("mailto:punkable@protonmail.com")}>
          {t("ab.contact")} · punkable@protonmail.com ↗
        </button>
      </div>
      {partying && <p className="s-egg">🦫 {t("ab.egg")} 🦫</p>}

      <DonateCard />

      {/* A quick way back to the changelog; full update controls live in General. */}
      <button className="s-btn s-btn-soft s-btn-ico" style={{ marginTop: 12 }} onClick={onWhatsNew}>
        <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("sparkles") }} />
        <span>{t("ab.whatsNew")}</span>
      </button>

      <ResetZone onReset={onReset} />

      <p className="muted" style={{ marginTop: 14 }}>{t("ab.made")}</p>
    </>
  );
}

// ── App shell ──

function App() {
  const [cfg, setCfg] = useState(null);
  const contentRef = useRef(null);
  const searchRef = useRef(null);
  // Reopen on the last tab the user was looking at.
  const [tab, setTabRaw] = useState(() => {
    try { return localStorage.getItem("booki.lastTab") || "general"; } catch (_) { return "general"; }
  });
  const setTab = (t) => {
    setTabRaw(t);
    try { localStorage.setItem("booki.lastTab", t); } catch (_) {}
    requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0;
    });
  };
  const [version, setVersion] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [query, setQuery] = useState("");
  const searchResults = useMemo(() => findSettings(query), [query]);
  const [activeSearchResult, setActiveSearchResult] = useState(0);
  // One-time "start here" banner so a new user knows where to begin.
  const [introSeen, setIntroSeen] = useState(() => {
    try { return localStorage.getItem("booki.introSeen") === "1"; } catch (_) { return true; }
  });
  const dismissIntro = () => { setIntroSeen(true); try { localStorage.setItem("booki.introSeen", "1"); } catch (_) {} };
  const saveTimer = useRef(null);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Show "What's new" when the dock asks us to: either it was requested before
  // this window existed (pending flag, asked once on mount) or it arrives live
  // as an event while the window is open.
  useEffect(() => {
    let un;
    let un2;
    dockApi.takePendingChangelog().then((v) => v && setShowChangelog(true)).catch(() => {});
    onShowChangelog(() => setShowChangelog(true)).then((u) => (un = u));
    // The dock can ask us to open on a specific tab (e.g. the empty-dock "+").
    const showTab = () =>
      dockApi.takePendingTab().then((tb) => tb && setTab(tb)).catch(() => {});
    showTab();
    onShowTab(showTab).then((u) => (un2 = u));
    // Suppress native HTML5 image drag: the pinned-app icons are <img>, and
    // dragging one out of the window let the OS save a stray .png. Our reorder
    // dragging is pointer-event based, so this has no downside.
    const noDrag = (e) => e.preventDefault();
    window.addEventListener("dragstart", noDrag);
    return () => {
      un && un();
      un2 && un2();
      window.removeEventListener("dragstart", noDrag);
    };
  }, []);

  useEffect(() => {
    configApi.get().then(async (c) => {
      await ensureLang(c.language); // load pt/fr/de before first render
      setCfg(c);
      applyTheme(c);
    });
    dockApi.appVersion().then(setVersion);
  }, []);

  useEffect(() => {
    setActiveSearchResult(0);
  }, [query]);

  const chooseSearchResult = (result) => {
    if (!result) return;
    setTab(result.tab);
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const onSearchKeyDown = (e) => {
    if (!searchResults.length) {
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery("");
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveSearchResult((index) => (index + delta + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      chooseSearchResult(searchResults[activeSearchResult]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  };

  useEffect(() => {
    const focusSearch = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const set = (patch) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      // Switching language may need its dictionary → load then re-render.
      if (prev && prev.language !== next.language) {
        ensureLang(next.language).then(() => setCfg((c) => ({ ...c })));
      } else {
        setLang(next.language);
      }
      applyTheme(next);
      setSaveState("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await configApi.save(next);
          await emitConfigChanged();
          setSaveState("saved");
        } catch (_) {
          setSaveState("error");
        }
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
      if (e.defaultPrevented || e.key !== "Escape") return;
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

  if (!cfg) return <SettingsSkeleton />;

  return (
    <div className="s-shell">
      <aside className="s-sidebar">
        <div className="s-brand">
          <img src="/brand/svg/isotype.svg" alt="" />
          <img className="brand-word word-black" src="/brand/svg/logoonlytextblack.svg" alt="Booki" />
          <img className="brand-word word-white" src="/brand/svg/logoonlytextwhite.svg" alt="Booki" />
        </div>
        <div className="s-search">
          <input
            ref={searchRef}
            type="search"
            placeholder={t("search.placeholder")}
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!query.trim()}
            aria-controls={query.trim() ? "settings-search-results" : undefined}
            aria-activedescendant={query.trim() && searchResults[activeSearchResult] ? `settings-search-${searchResults[activeSearchResult].key}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          {query.trim() && (
            <div id="settings-search-results" className="s-search-results" role="listbox">
              {searchResults.map((result, index) => (
                  <button
                    key={result.key}
                    type="button"
                    role="option"
                    id={`settings-search-${result.key}`}
                    className={index === activeSearchResult ? "active" : ""}
                    aria-selected={index === activeSearchResult}
                    onClick={() => chooseSearchResult(result)}
                  >
                    <span>{result.label}</span>
                    <span className="s-search-tab">{result.tabLabel}</span>
                  </button>
              ))}
              {!searchResults.length && (
                <div className="s-search-none">
                  <img className="empty-capy sm" src="/brand/svg/isotype.svg" alt="" />
                  {t("search.none")}
                </div>
              )}
            </div>
          )}
        </div>
        <nav style={{ "--active": Math.max(0, TABS.findIndex(([id]) => id === tab)) }}>
          <span className="s-nav-indicator" aria-hidden="true" />
          {TABS.map(([id, label, ico]) => (
            <button
              key={id}
              className={"s-navitem" + (tab === id ? " active" : "")}
              aria-current={tab === id ? "page" : undefined}
              type="button"
              onClick={() => setTab(id)}
            >
              <span className="s-navicon" dangerouslySetInnerHTML={{ __html: icon(ico) }} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
        <div className="s-sidebar-foot">
          <button className="s-btn s-btn-ghost" onClick={() => dockApi.quit()}>{t("act.quit")}</button>
        </div>
      </aside>
      <main ref={contentRef} className="s-content">
        {!introSeen && (
          <div className="s-intro">
            <span className="s-intro-icon" dangerouslySetInnerHTML={{ __html: icon("info") }} />
            <div className="s-intro-body">
              <strong>{t("intro.title")}</strong>
              <span className="muted">{t("intro.body")}</span>
            </div>
            <button className="s-btn s-btn-sm" onClick={() => { setTab("apps"); dismissIntro(); }}>
              {t("intro.cta")}
            </button>
            <button className="s-intro-x" title={t("intro.dismiss")} aria-label={t("intro.dismiss")} onClick={dismissIntro}
              dangerouslySetInnerHTML={{ __html: icon("x") }} />
          </div>
        )}
        <div key={tab}>
          <div className={"s-save-status status-" + saveState} role="status" aria-live="polite">
            {saveState === "saving" ? t("status.saving") : saveState === "saved" ? t("status.saved") : saveState === "error" ? t("status.saveError") : ""}
          </div>
          {tab === "appearance" && <Appearance cfg={cfg} set={set} />}
          {tab === "behavior" && <Behavior cfg={cfg} set={set} />}
          {tab === "apps" && <Apps cfg={cfg} set={set} />}
          {tab === "general" && <General cfg={cfg} set={set} onWhatsNew={() => setShowChangelog(true)} />}
          {tab === "faq" && <Faq version={version || "..."} />}
          {tab === "about" && <About version={version || "..."} onWhatsNew={() => setShowChangelog(true)} onReset={reset} />}
        </div>
      </main>
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </div>
  );
}

// Shown for the instant before config loads — mirrors the real layout so the
// window reads as "loading", not blank or a lone "…".
function SettingsSkeleton() {
  return (
    <div className="s-shell" aria-busy="true">
      <aside className="s-sidebar">
        <div className="s-brand"><span className="sk sk-logo" /><span className="sk sk-word" /></div>
        <div className="sk sk-search" />
        <nav className="s-nav">
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="sk sk-nav" />)}
        </nav>
      </aside>
      <main className="s-content">
        <span className="sk sk-title" />
        <span className="sk sk-sub" />
        {Array.from({ length: 3 }).map((_, i) => <span key={i} className="sk sk-card" />)}
      </main>
    </div>
  );
}

// "What's new" shown as a modal inside Settings (no fragile extra window).
function ChangelogModal({ onClose }) {
  useModalControls(onClose);
  return createPortal((
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal cl-modal" role="dialog" aria-modal="true" aria-label={t("cl.title")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong><img className="cl-capy" src="/brand/svg/isotype.svg" alt="" /> {t("cl.title")}</strong>
          <button className="pin-btn ico" aria-label={t("stack.close")} onClick={onClose} dangerouslySetInnerHTML={{ __html: icon("x") }} />
        </div>
        <div className="cl-list">
          <div className="cl-beta">
            <span className="cl-beta-badge">{t("cl.betaBadge")}</span>
            <p className="cl-beta-body">{t("cl.betaBody")}</p>
          </div>
          {CHANGELOG.slice(0, 1).map((entry, idx) => (
            <section key={entry.version} className={"cl-entry" + (idx === 0 ? " latest" : "")}>
              <div className="cl-entry-head">
                <span className="cl-ver">v{entry.version}</span>
                {idx === 0 && <span className="cl-new">{t("cl.new")}</span>}
                <span className="cl-date">{entry.date}</span>
              </div>
              {entry.headline && <p className="cl-headline">{entry.headline}</p>}
              {entry.sections.map((sec, k) => (
                <div key={k} className="cl-section">
                  <h3 className="cl-section-title"><ChangelogIcon name={sec.icon} />{sec.title}</h3>
                  <ul className="cl-notes">
                    {sec.notes.map((n, j) => <li key={j}>{n}</li>)}
                  </ul>
                </div>
              ))}
            </section>
          ))}
          {CHANGELOG.length > 1 && (
            <div className="cl-recent">
              <h4 className="cl-recent-title">{t("cl.recentTitle")}</h4>
              <ul className="cl-recent-list">
                {CHANGELOG.slice(1, 5).map((entry) => (
                  <li key={entry.version}>
                    <span className="cl-recent-ver">v{entry.version}</span>
                    <span className="cl-recent-headline">{entry.headline}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="cl-foot">
          <span className="cl-credit">{t("cl.by")} Punkable · @0xPunki</span>
          <button className="s-btn" onClick={onClose}>{t("cl.ok")}</button>
        </div>
      </div>
    </div>
  ), document.body);
}

const settingsRoot = import.meta.hot?.data.settingsRoot || createRoot(document.getElementById("root"));
settingsRoot.render(<App />);
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.settingsRoot = settingsRoot;
  });
}
