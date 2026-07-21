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
  FluentProvider,
  Switch,
  Slider as FluentSlider,
  Button,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
  Dropdown,
  Option,
  Card,
  CardHeader,
} from "@fluentui/react-components";
import {
  AddRegular,
  FolderRegular,
  FolderAddRegular,
  LineHorizontal3Regular,
  DeleteRegular,
  GridRegular,
  ListRegular,
  ArrowUndo24Regular,
  Flash24Regular,
  Info24Regular,
  Search24Regular,
} from "@fluentui/react-icons";
import { buildFluentTheme } from "./fluent-theme.js";
import {
  WIDGET_ORDER,
  WIDGET_META,
  WIDGET_ICONS,
  widgetDisplayName as widgetDisplayNameShared,
} from "./widgets-meta.js";

const CHANGELOG_ICONS = {
  search: Search24Regular,
  undo: ArrowUndo24Regular,
  performance: Flash24Regular,
};

function ChangelogIcon({ name }) {
  const FluentIcon = CHANGELOG_ICONS[name];
  if (FluentIcon) {
    return (
      <span className="cl-ico" aria-hidden="true">
        <FluentIcon />
      </span>
    );
  }
  if (name) {
    return (
      <span className="cl-ico cl-ico-emoji" aria-hidden="true">
        {name}
      </span>
    );
  }
  return (
    <span className="cl-ico" aria-hidden="true">
      <Info24Regular />
    </span>
  );
}

import { applyTheme } from "./theme.js";
import {
  SURFACE_STYLES,
  SURFACE_TINT_PRESETS,
  resolveSurfaceStyle,
  legacyNotchFromSurface,
  surfaceAlpha,
  resolveGlassTint,
  glassFillColor,
  applySurfaceVars,
} from "./surface.js";
import { canMergeKind, mergePins, mkPin, normalizeGroups as normalizePinned } from "./pins.js";
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

/** Click-to-rename label — calm read mode until the user asks to edit. */
function PinName({ value, editing, onEdit, onChange, onDone, className = "", title }) {
  if (editing) {
    return (
      <input
        className={"pin-name-edit " + className}
        value={value}
        autoFocus
        title={title || ""}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onDone();
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={"pin-name-btn " + className}
      title={title || t("apps.renameHint")}
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {value}
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

const LANG_OPTIONS = [
  { value: "system", key: "lang.system" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

// Searchable option index: i18n key → tab that hosts it (settings search).
const SEARCH_INDEX = [
  ["ap.theme", "appearance"], ["ap.accent", "appearance"],
  ["ap.surface", "appearance"], ["ap.translucency", "appearance"],
  ["ap.solidity", "appearance"], ["ap.surfaceTint", "appearance"],
  ["ap.iconSize", "appearance"], ["ap.spacing", "appearance"], ["ap.radius", "appearance"],
  ["ap.compact", "appearance"],
  ["ap.language", "general"], ["ap.backup", "general"],
  ["be.position", "behavior"], ["be.autoHide", "behavior"], ["be.hideDelay", "behavior"], ["be.edgeGap", "behavior"],
  ["be.taskbarFollow", "behavior"], ["be.taskbarSettle", "behavior"], ["be.taskbarHoldHover", "behavior"],
  ["ap.notchSize", "behavior"], ["be.notchPeek", "behavior"],
  ["be.reveal", "behavior"], ["be.notchAlwaysVisible", "behavior"], ["prof.title", "behavior"],
  ["apps.newFolder", "apps"], ["group.ungroup", "apps"], ["group.takeOut", "apps"],
  ["be.multiNotch", "behavior"],
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
  "ap.surface": "mica acrylic acrilico tintado tinted solido solid material cristal glass windhawk taskbar barra",
  "ap.solidity": "solidez opacity opacidad translucidez translucency cristal",
  "ap.surfaceTint": "color cristal tint tinta fondo glass tint surface",
  "ap.translucency": "transparencia translucidez opacity material strength",
  "be.autoHide": "ocultar esconder auto hide hidden smart inteligente",
  "be.taskbarFollow": "taskbar barra tareas autohide ocultar windhawk seguir follow",
  "be.taskbarSettle": "retraso delay settle bajar notch taskbar barra",
  "be.taskbarHoldHover": "mantener hold hover cursor notch dock taskbar",
  "be.position": "posicion position borde edge arriba abajo izquierda derecha",
  "be.magnify": "zoom ampliar enlargement magnify",
  "ap.notchSize": "notch pastilla tamano size pill",
  "be.notchPeek": "notch peek asomar",
  "be.reveal": "revelar reveal hover click notch",
  "apps.title": "aplicaciones programas pinned apps ancladas grupo group carpeta folder",
  "apps.newFolder": "grupo group carpeta folder merge fusionar",
  "apps.widgets": "widget reloj cpu ram bateria media musica",
  "clip.memory": "portapapeles clipboard privacidad privacy historial history",
  "sc.title": "atajo shortcut hotkey teclado keyboard",
  "prof.title": "perfil profile configuracion setup",
  "ap.backup": "respaldo backup exportar importar export import",
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

function widgetDisplayName(widget) {
  return widgetDisplayNameShared(widget, t);
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
    return (pinned || []).find((item) => item.id === ref.id) || null;
  }
  const group = (pinned || []).find((item) => item.id === ref.groupId);
  return (group?.children || []).find((child) => child.id === ref.id) || null;
}

function updateWidgetStyleForRef(pinned, ref, value) {
  if (!ref) return pinned;
  if (ref.type === "top") {
    return pinned.map((item) => (item.id === ref.id ? { ...item, style: value } : item));
  }
  return pinned.map((item) =>
    item.id === ref.groupId
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
    <label className="r-toggle fui-toggle">
      <span className="r-toggle-text">
        {label}
        {hint ? <small className="r-toggle-hint">{hint}</small> : null}
      </span>
      <Switch
        checked={!!checked}
        onChange={(_e, data) => onChange(data.checked)}
      />
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
    <Card className={"settings-section " + (!title ? "settings-section-headless " : "") + className}>
      {title ? (
        <div className="settings-section-head">
          <span className="settings-section-icon" dangerouslySetInnerHTML={{ __html: icon(iconName) }} />
          <div>
            <h2>{title}</h2>
            {hint ? <p>{hint}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="settings-section-body">{children}</div>
    </Card>
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
  return (
    <div className="r-slider fui-slider">
      <FluentSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(_e, data) => onChange(data.value)}
      />
      <span className="slider-bubble">{fmt ? fmt(value) : value}</span>
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
          {o.icon && (
            typeof o.icon === "string" && o.icon.includes("<svg")
              ? <span className="seg-ico" dangerouslySetInnerHTML={{ __html: o.icon }} />
              : <span className="seg-ico">{o.icon}</span>
          )}
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
        {t("be.dockLabel")}: <strong>{t(`edge.${dockEdge}`)}</strong>
        {showNotch && (
          <>
            {" · "}{t("be.notchLabel")}: <strong>{posLabel(pos)}</strong>
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
    <CollapsibleSection
      title={t("prof.title")}
      icon="copy"
      hint={t("prof.hint")}
      count={profiles.length || null}
      defaultOpen={false}
      className="profiles-section"
    >
      {profiles.map((n) => (
        <div key={n} className={"prof-row" + (n === active ? " prof-active" : "")}>
          <span className="prof-name">
            {n === active && (
              <span className="prof-check" dangerouslySetInnerHTML={{ __html: icon("check") }} />
            )}
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
            {delArm === n
              ? t("prof.deleteConfirm")
              : <span dangerouslySetInnerHTML={{ __html: icon("x") }} />}
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
    </CollapsibleSection>
  );
}

/** Unified dock + notch surface picker — one finish for both windows. */
function SurfaceStylePicker({ cfg, set }) {
  const cur = resolveSurfaceStyle(cfg);
  return (
    <div className="surface-row surface-row-compact" role="listbox" aria-label={t("ap.surface")}>
      {SURFACE_STYLES.map((s) => (
        <button
          key={s}
          type="button"
          role="option"
          aria-selected={cur === s}
          className={"surface-chip surface-" + s + (cur === s ? " active" : "")}
          onClick={() => {
            set(
              { surfaceStyle: s, notchStyle: legacyNotchFromSurface(s) },
              { flush: true, afterSave: () => dockApi.notchPreview() }
            );
          }}
          title={t(`surface.${s}Hint`)}
        >
          <span className="surface-swatch" aria-hidden="true" />
          <strong>{t(`surface.${s}`)}</strong>
        </button>
      ))}
    </div>
  );
}

/** Color of the frosted glass fill (dock + notch), separate from accent. */
function SurfaceTintPicker({ value, onChange, accent, autoBlack = false }) {
  const v = (value || "").toLowerCase();
  // Empty = theme auto (mica/acrylic). Tinted treats empty as black.
  const effective = (v || (autoBlack ? "#000000" : "#808080")).toLowerCase();
  const isPreset = SURFACE_TINT_PRESETS.some(([, hex]) => hex.toLowerCase() === v)
    || (accent && accent.toLowerCase() === v);
  const blackActive = v === "#000000" || (!v && autoBlack);
  return (
    <div className="accent-picker surface-tint-picker">
      <div className="accent-swatches">
        {SURFACE_TINT_PRESETS.map(([name, hex]) => (
          <button
            key={hex}
            type="button"
            className={"accent-sw" + ((hex.toLowerCase() === "#000000" ? blackActive : v === hex.toLowerCase()) ? " active" : "")}
            style={{ "--sw": hex }}
            title={name}
            onClick={() => onChange(hex)}
          >
            <span className="accent-check">✓</span>
          </button>
        ))}
        {accent && (
          <button
            type="button"
            className={"accent-sw" + (v === accent.toLowerCase() ? " active" : "")}
            style={{ "--sw": accent }}
            title={t("ap.surfaceTintAccent")}
            onClick={() => onChange(accent)}
          >
            <span className="accent-check">✓</span>
          </button>
        )}
        <label
          className={"accent-custom" + (v && !isPreset ? " active" : "")}
          style={{ "--sw": effective }}
          title={t("ap.custom")}
        >
          <input
            type="color"
            value={effective}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="accent-plus">{v && !isPreset ? "✓" : "+"}</span>
        </label>
      </div>
      <span className="accent-hex">{v ? v.toUpperCase() : (autoBlack ? "#000000" : t("ap.surfaceTintAuto"))}</span>
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
  const items = (cfg.pinned || []).filter((p) => p.kind !== "separator" && p.kind !== "trash").slice(0, 7);
  const count = items.length || 5;
  const scale = 0.42;
  const size = Math.round((cfg.iconSize || 48) * scale * (cfg.compact ? 0.92 : 1));
  const gap = Math.round((cfg.spacing ?? 6) * scale + 2);
  const vertical = cfg.edge === "left" || cfg.edge === "right";
  const edge = cfg.edge || "bottom";
  const surface = resolveSurfaceStyle(cfg);
  const alpha = surfaceAlpha(cfg);
  const fillTint = glassFillColor(cfg);
  const mid = Math.floor(count / 2);
  const zoom = cfg.magnification ? cfg.zoom || 1.35 : 1;
  const radius = Math.round((cfg.cornerRadius ?? 12) * scale);
  const notchScale = Math.min(1.5, Math.max(0.7, Number(cfg.notchScale) || 1));
  const peek = cfg.notchPeek !== false;
  const fills = {
    mica: `color-mix(in srgb, ${fillTint} ${Math.min(96, 55 + alpha * 40)}%, transparent)`,
    acrylic: `color-mix(in srgb, ${fillTint} ${alpha * 88}%, transparent)`,
    tinted: `color-mix(in srgb, ${fillTint} ${Math.round(alpha * 100)}%, transparent)`,
    solid: `color-mix(in srgb, ${fillTint} 92%, var(--accent) 8%)`,
  };
  const blurPx = surface === "solid" ? 0 : surface === "tinted" ? 18 : surface === "mica" ? 12 : 16;
  const notchAlong = Math.round(42 * notchScale);
  const notchAcross = Math.max(4, Math.round((peek ? 6 : 5) * notchScale));
  return (
    <div className={"preview prev-" + edge + " prev-surface-" + surface + (peek ? " prev-peek" : "")}>
      <div
        className="preview-bar"
        style={{
          flexDirection: vertical ? "column" : "row",
          gap,
          borderRadius: surface === "solid" ? Math.max(4, radius) : surface === "tinted" ? 14 : radius + 5,
          background: fills[surface] || fills.acrylic,
          border: surface === "tinted" ? "1px solid rgba(255,255,255,0.10)" : undefined,
          backdropFilter: surface === "solid" ? "none" : `blur(${blurPx}px)`,
        }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const item = items[i];
          const s = i === mid ? Math.round(size * zoom) : size;
          return (
            <span
              key={item?.id || i}
              className={"preview-tile" + (item?.kind === "group" ? " is-group" : "")}
              style={{
                width: s,
                height: s,
                borderRadius: radius,
                transform: i === mid ? (vertical ? "translateX(-4px)" : "translateY(-4px)") : "none",
              }}
            >
              <PreviewIcon item={item} />
            </span>
          );
        })}
      </div>
      <span
        className="preview-notch"
        style={{
          width: vertical ? notchAcross : notchAlong,
          height: vertical ? notchAlong : notchAcross,
          borderRadius: surface === "solid" ? 3 : peek ? (vertical ? "0 8px 8px 0" : "8px 8px 0 0") : 999,
        }}
        title={t("ap.notchSize")}
      />
    </div>
  );
}

function PreviewIcon({ item }) {
  const [src, setSrc] = useState(item && item.icon ? item.icon : null);
  useEffect(() => {
    let alive = true;
    if (item && item.kind === "group") {
      setSrc(null);
      return () => { alive = false; };
    }
    if (item && !item.icon && item.path) {
      dockApi.appIcon(item.path).then((u) => alive && setSrc(u)).catch(() => {});
    } else {
      setSrc(item && item.icon ? item.icon : null);
    }
    return () => {
      alive = false;
    };
  }, [item && item.path, item && item.kind, item && item.icon]);
  if (item && item.kind === "group") {
    return <span className="preview-glyph" title={item.name || t("group.new")} />;
  }
  if (item && item.kind === "folder") {
    return <span className="preview-glyph" style={{ background: "color-mix(in srgb, var(--accent) 40%, #c9a227)" }} />;
  }
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

// One installed-app suggestion icon (native icon, falls back to a letter).
function SuggIcon({ path, name }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    dockApi.appIcon(path).then((u) => alive && setSrc(u)).catch(() => {});
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
    installedAppsOnce().then((a) => setGroups(normalizeSuggestGroups(a)));
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
            setGroups(normalizeSuggestGroups(fresh));
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
          <button
            className="sugg-clear"
            title={t("apps.clearNo")}
            onClick={() => setQ("")}
            dangerouslySetInnerHTML={{ __html: icon("x") }}
          />
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
function normalizeSuggestGroups(a) {
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
      dockApi.imageDataUri(item.path).then((u) => alive && u && setSrc(u)).catch(() => {});
    } else if (item.path) {
      dockApi.appIcon(item.path).then((u) => alive && setSrc(u)).catch(() => {});
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
          : <span dangerouslySetInnerHTML={{ __html: icon("sparkles") }} />}
      </span>
    );
  }
  return (
    <span className="pin-thumb">
      {src ? <img src={src} alt="" /> : (item.name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

const WIDGET_EMOJI = WIDGET_ICONS;

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
  const surface = resolveSurfaceStyle(cfg);
  const solidSurface = surface === "solid";
  const flushSurface = (patch) =>
    set(patch, { flush: true, afterSave: () => dockApi.notchPreview() });
  return (
    <>
      <PageHeader icon="palette" title={t("ap.title")}>
        {t("ap.hint")}
      </PageHeader>
      <MiniDockPreview cfg={cfg} />

      <SettingsSection title={t("gp.theme")} icon="palette" hint={t("gp.themeHint")}>
        <Row label={t("ap.theme")}>
          <SegmentedControl
            value={cfg.theme || "system"}
            onChange={(v) => set({ theme: v })}
            options={[
              { value: "system", label: t("theme.system") },
              { value: "light", label: t("theme.light"), icon: icon("sun") },
              { value: "dark", label: t("theme.dark"), icon: icon("moon") },
              { value: "auto", label: t("theme.auto"), icon: icon("clock") },
            ]}
          />
        </Row>
      </SettingsSection>

      <SettingsSection title={t("gp.surface")} icon="sliders" hint={t("ap.surfaceHint")}>
        <SurfaceStylePicker cfg={cfg} set={set} />
        {!solidSurface && (
          <>
            <Row label={t("ap.surfaceTint")} hint={t("ap.surfaceTintHint")}>
              <SurfaceTintPicker
                value={cfg.surfaceTint || ""}
                accent={cfg.accent}
                autoBlack={surface === "tinted"}
                onChange={(v) => flushSurface({ surfaceTint: v })}
              />
            </Row>
            <Row label={t("ap.solidity")} hint={t("ap.solidityHint")}>
              <Slider
                value={cfg.materialStrength ?? 80}
                min={40}
                max={100}
                step={5}
                fmt={(v) => `${v}%`}
                onChange={(v) => flushSurface({ materialStrength: v })}
              />
            </Row>
          </>
        )}
      </SettingsSection>

      <SettingsSection title={t("ap.accent")} icon="palette" hint={t("ap.accentHint")}>
        <AccentPicker value={cfg.accent} onChange={(v) => set({ accent: v })} />
      </SettingsSection>

      <CollapsibleSection
        title={t("gp.size")}
        icon="app"
        hint={t("gp.sizeHint")}
        defaultOpen={false}
      >
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
        <Toggle label={t("ap.compact")} hint={t("ap.compactHint")}
          checked={!!cfg.compact}
          onChange={(v) => set({ compact: v })} />
      </CollapsibleSection>
    </>
  );
}

function Behavior({ cfg, set }) {
  const [monitors, setMonitors] = useState([]);
  useEffect(() => {
    dockApi.listMonitors().then((m) => setMonitors(m || []));
  }, []);
  const hideOn = cfg.autoHideMode !== "off";
  return (
    <>
      <PageHeader icon="settings" title={t("be.title")}>{t("be.hint")}</PageHeader>

      <SettingsSection title={t("gp.dock")} icon="app" hint={t("gp.dockHint")}>
        <Row label={t("be.position")} hint={t("be.positionHint")}>
          <PositionPicker cfg={cfg} set={set} />
        </Row>
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
        {hideOn && (
          <Row label={t("be.hideDelay")} hint={t("be.hideDelayHint")}>
            <Slider value={cfg.autoHideDelay ?? 650} min={0} max={2500} step={50}
              fmt={(v) => `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 2)} s`}
              onChange={(v) => set({ autoHideDelay: v })} />
          </Row>
        )}
      </SettingsSection>

      <CollapsibleSection
        title={t("gp.advancedDock")}
        icon="sliders"
        hint={t("gp.advancedDockHint")}
        defaultOpen={false}
      >
        <Row label={t("be.monitor")}>
          <MonitorPicker value={cfg.monitor} monitors={monitors}
            onChange={(v) => set({ monitor: v })} />
        </Row>
        <Row label={t("be.edgeGap")} hint={t("be.edgeGapHint")}>
          <Slider value={cfg.edgeGap ?? 48} min={8} max={72} step={4}
            fmt={(v) => `${v}px`} onChange={(v) => set({ edgeGap: v })} />
        </Row>
        <Toggle label={t("be.alwaysOnTop")} hint={t("be.alwaysOnTopHint")}
          checked={cfg.alwaysOnTop !== false}
          onChange={(v) => { set({ alwaysOnTop: v }); dockApi.setAlwaysOnTop(v); }} />
      </CollapsibleSection>

      <SettingsSection title={t("gp.taskbar")} icon="app" hint={t("gp.taskbarHint")}>
        <Toggle
          label={t("be.taskbarFollow")}
          hint={t("be.taskbarFollowHint")}
          checked={cfg.taskbarFollow !== false}
          onChange={(v) => set({ taskbarFollow: v })}
        />
        {cfg.taskbarFollow !== false && (
          <>
            <Row label={t("be.taskbarSettle")} hint={t("be.taskbarSettleHint")}>
              <Slider
                value={cfg.taskbarSettleMs ?? 1000}
                min={0}
                max={3000}
                step={100}
                fmt={(v) => (v === 0 ? t("be.taskbarSettleOff") : `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)} s`)}
                onChange={(v) => set({ taskbarSettleMs: v })}
              />
            </Row>
            <Toggle
              label={t("be.taskbarHoldHover")}
              hint={t("be.taskbarHoldHoverHint")}
              checked={cfg.taskbarHoldWhileHover !== false}
              onChange={(v) => set({ taskbarHoldWhileHover: v })}
            />
            <p className="muted" style={{ marginTop: 4 }}>{t("be.taskbarWindhawkTip")}</p>
          </>
        )}
      </SettingsSection>

      <SettingsSection title={t("gp.notch")} icon="eye" hint={t("gp.notchHint")}>
        <Row label={t("ap.notchSize")} hint={t("ap.notchSizeHint")}>
          <Slider
            value={Math.round((Number(cfg.notchScale) || 1) * 100)}
            min={70}
            max={150}
            step={5}
            fmt={(v) => `${v}%`}
            onChange={(v) => {
              set(
                { notchScale: v / 100 },
                { flush: true, afterSave: () => dockApi.notchPreview() }
              );
            }}
          />
        </Row>
        <Toggle
          label={t("be.notchPeek")}
          hint={t("be.notchPeekHint")}
          checked={cfg.notchPeek !== false}
          onChange={(v) => {
            set({ notchPeek: v }, { flush: true, afterSave: () => dockApi.notchPreview() });
          }}
        />
        {hideOn ? (
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
        ) : (
          <p className="muted">{t("be.notchNeedsHide")}</p>
        )}
      </SettingsSection>

      {hideOn && (
        <CollapsibleSection
          title={t("gp.advancedNotch")}
          icon="eye"
          hint={t("gp.advancedNotchHint")}
          defaultOpen={false}
        >
          <Toggle
            label={t("be.notchAlwaysVisible")}
            hint={t("be.notchAlwaysVisibleHint")}
            checked={!!cfg.notchAlwaysVisible}
            onChange={(v) => {
              set({ notchAlwaysVisible: v }, { flush: true, afterSave: () => dockApi.notchPreview() });
            }}
          />
        </CollapsibleSection>
      )}

      <MultiNotchSection cfg={cfg} set={set} />

      <CollapsibleSection
        title={t("gp.interaction")}
        icon="sparkles"
        hint={t("gp.interactionHint")}
        defaultOpen={false}
      >
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
      </CollapsibleSection>

      <ProfilesCard cfg={cfg} set={set} />
    </>
  );
}

const MULTI_NOTCH_SUGGESTIONS = {
  browsers: ["chrome", "firefox", "edge", "brave", "opera", "vivaldi", "arc", "helium"],
  design: ["photoshop", "illustrator", "figma", "gimp", "blender", "maya", "cinema4d"],
  editors: ["premiere", "aftereffects", "davinciresolve", "capcut", "obs"],
  code: [
    "opencode", "cursor", "code", "vscodium", "sublime_text", "atom", "notepad++",
    "idea64", "webstorm64", "pycharm64", "datagrip64", "goland64", "rustrover64", "rider64",
    "clion64", "phpstorm64", "rubymine64", "rider64", "fleet", "zed",
  ],
  productivity: ["notion", "obsidian", "evernote", "onenote", "todoist", "ticktick", "slack", "teams", "discord", "telegram", "whatsapp"],
};

function MultiNotchSection({ cfg, set }) {
  const [custom, setCustom] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const enabled = !!cfg.multiNotchEnabled;
  const apps = cfg.multiNotchApps || [];
  const add = (name) => {
    const key = String(name).toLowerCase().trim().replace(/\.exe$/i, "");
    if (!key || apps.some((a) => a.toLowerCase() === key)) return;
    set({ multiNotchApps: [...apps, key] });
  };
  const remove = (key) => {
    set({ multiNotchApps: apps.filter((a) => a.toLowerCase() !== key.toLowerCase()) });
  };
  return (
    <CollapsibleSection
      title={t("be.multiNotch")}
      icon="eye"
      hint={t("be.multiNotchHint")}
      count={enabled ? apps.length : null}
      defaultOpen={false}
    >
      <Toggle label={t("be.multiNotch")} checked={enabled}
        onChange={(v) => set({ multiNotchEnabled: v })} />
      {enabled && (
        <>
          <Toggle label={t("be.multiNotchAutoSuggest")}
            checked={cfg.multiNotchAutoSuggest !== false}
            onChange={(v) => set({ multiNotchAutoSuggest: v })} />
          <div className="mn-add">
            <input
              className="r-hotkey-input"
              value={custom}
              placeholder={t("be.multiNotchPlaceholder")}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (add(custom), setCustom(""))}
            />
            <Button onClick={() => { add(custom); setCustom(""); }}>{t("be.multiNotchAdd")}</Button>
          </div>
          {apps.length === 0 ? (
            <p className="muted mn-empty">{t("be.multiNotchEmpty")}</p>
          ) : (
            <div className="mn-list">
              {apps.map((app) => (
                <span key={app} className="mn-tag">
                  {app}
                  <button type="button" onClick={() => remove(app)} aria-label={t("apps.remove")}>
                    <span dangerouslySetInnerHTML={{ __html: icon("x") }} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            className={"mn-suggest-toggle" + (suggestOpen ? " open" : "")}
            onClick={() => setSuggestOpen((o) => !o)}
            aria-expanded={suggestOpen}
          >
            <span>{t("be.multiNotchSuggest")}</span>
            <span className="muted">{t("be.multiNotchSuggestCount").replace("{n}", String(
              Object.values(MULTI_NOTCH_SUGGESTIONS).reduce((n, list) => n + list.length, 0)
            ))}</span>
            <span dangerouslySetInnerHTML={{ __html: icon(suggestOpen ? "chevron-down" : "chevron-right") }} />
          </button>
          {suggestOpen && (
            <div className="mn-suggest-panel">
              <p className="muted">{t("be.multiNotchSuggestHint")}</p>
              {Object.entries(MULTI_NOTCH_SUGGESTIONS).map(([cat, list]) => (
                <details key={cat} className="mn-suggest-group">
                  <summary>{t(`mn.${cat}`)} <span className="muted">{list.length}</span></summary>
                  <div className="mn-chips">
                    {list.map((app) => {
                      const active = apps.some((a) => a.toLowerCase() === app);
                      return (
                        <button key={app} type="button" className={"mn-chip" + (active ? " active" : "")}
                          onClick={() => active ? remove(app) : add(app)} disabled={active}>
                          {app}
                        </button>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </CollapsibleSection>
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

/** Coalesce pointer moves to one RAF tick; return detach(). */
function bindRafMove(onFrame) {
  let raf = 0;
  let last = null;
  const onMove = (ev) => {
    last = ev;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (last) onFrame(last);
    });
  };
  const detach = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("pointermove", onMove);
  };
  window.addEventListener("pointermove", onMove);
  return { onMove, detach };
}

function Apps({ cfg, set }) {
  const listRef = useRef(null);
  const gridRef = useRef(null);
  const kidMenuRef = useRef(null);
  // During a drag we mutate a local draft and only persist on pointerup —
  // avoids config saves / Settings reloads on every pointer frame.
  const [draftPinned, setDraftPinned] = useState(null);
  const pinnedRef = useRef(cfg.pinned);
  pinnedRef.current = draftPinned || cfg.pinned;
  const displayPinned = draftPinned || cfg.pinned;
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
  // Two-step remove for groups so a stray click can't wipe several pins.
  const [removeArm, setRemoveArm] = useState(-1);
  // Click-to-rename — keeps the list calm until the user edits a name.
  const [renameKey, setRenameKey] = useState(null);
  const [kidsHintDismissed, setKidsHintDismissed] = useState(() => {
    try { return localStorage.getItem("booki.kidsHintDismissed") === "1"; } catch (_) { return false; }
  });
  const dismissKidsHint = () => {
    setKidsHintDismissed(true);
    try { localStorage.setItem("booki.kidsHintDismissed", "1"); } catch (_) {}
  };
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

  const startDrag = (i) => (e) => {
    e.preventDefault();
    drag.current = { from: i };
    mergeRef.current = -1;
    setMergeInto(-1);
    setDraftPinned([...pinnedRef.current]);
    const { detach } = bindRafMove((ev) => {
      if (!listRef.current || !drag.current) return;
      const lis = [...listRef.current.querySelectorAll(".pin-item:not(.pin-child)")];
      const from = drag.current.from;
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
        const canMerge =
          canMergeKind(dragged?.kind) && (canMergeKind(target?.kind) || target?.kind === "group");
        if (center && canMerge) {
          if (mergeRef.current !== over) { mergeRef.current = over; setMergeInto(over); }
          return;
        }
      }
      if (mergeRef.current !== -1) { mergeRef.current = -1; setMergeInto(-1); }
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
        setDraftPinned(p);
      }
    });
    const onUp = () => {
      detach();
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const m = mergeRef.current;
      const from = drag.current?.from;
      let next = pinnedRef.current;
      if (m >= 0 && from != null && m !== from) {
        const dragged = next[from];
        const target = next[m];
        if (dragged && target) next = mergePins(next, dragged.id, target.id, t("group.new"));
      }
      set({ pinned: next });
      setDraftPinned(null);
      mergeRef.current = -1;
      setMergeInto(-1);
      drag.current = null;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  // Drag a folder's child up/down to reorder it within that folder.
  const startDragChild = (gi, ci) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    childDrag.current = { gi, from: ci };
    setDraftPinned([...pinnedRef.current]);
    const { detach } = bindRafMove((ev) => {
      if (!listRef.current || !childDrag.current) return;
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
        setDraftPinned(pinnedRef.current.map((p, k) => (k === gi ? { ...p, children: kids } : p)));
      }
    });
    const onUp = () => {
      detach();
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      set({ pinned: pinnedRef.current });
      setDraftPinned(null);
      childDrag.current = null;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  // Grid version of the drag: same reorder + drop-onto-center-to-group logic,
  // but hit-tested in 2D (cards wrap onto multiple rows).
  const startDragGrid = (i) => (e) => {
    e.preventDefault();
    drag.current = { from: i };
    mergeRef.current = -1;
    setMergeInto(-1);
    setDraftPinned([...pinnedRef.current]);
    const { detach } = bindRafMove((ev) => {
      if (!gridRef.current || !drag.current) return;
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
        const canMerge =
          canMergeKind(dragged?.kind) && (canMergeKind(target?.kind) || target?.kind === "group");
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
        setDraftPinned(p);
      }
    });
    const onUp = () => {
      detach();
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const m = mergeRef.current;
      const from = drag.current?.from;
      let next = pinnedRef.current;
      if (m >= 0 && from != null && m !== from) {
        const dragged = next[from];
        const target = next[m];
        if (dragged && target) next = mergePins(next, dragged.id, target.id, t("group.new"));
      }
      set({ pinned: next });
      setDraftPinned(null);
      mergeRef.current = -1;
      setMergeInto(-1);
      drag.current = null;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const remove = (i) => {
    const item = cfg.pinned[i];
    if (item?.kind === "group" && (item.children || []).length > 0 && removeArm !== i) {
      setRemoveArm(i);
      return;
    }
    setRemoveArm(-1);
    set({ pinned: cfg.pinned.filter((_, k) => k !== i) });
  };
  const clearAll = () => { set({ pinned: [] }); setClearArm(false); setRemoveArm(-1); };

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
    if (path) set({ pinned: [...cfg.pinned, mkPin(path, "app")] });
  };
  const addFolder = async () => {
    const path = await pickFolder();
    if (path) set({ pinned: [...cfg.pinned, mkPin(path, "folder")] });
  };
  const addSep = () =>
    set({ pinned: [...cfg.pinned, { id: uid(), name: "", path: "", args: [], kind: "separator" }] });
  const hasTrash = cfg.pinned.some((p) => p.kind === "trash");
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
  const addToFolder = async (gi, kind = "app") => {
    const path = kind === "folder" ? await pickFolder() : await pickAppFile();
    if (!path) return;
    set({
      pinned: cfg.pinned.map((p, k) =>
        k === gi ? { ...p, children: [...(p.children || []), mkPin(path, kind === "folder" ? "folder" : "app")] } : p
      ),
    });
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

      <SettingsSection title={null} className="apps-primary-section">
        <div className="pin-board">
          <div className="pin-toolbar">
            <div className="pin-toolbar-main">
              <div className="pin-quick-add" role="group" aria-label={t("apps.quickAdd")}>
                <Button className="pin-add-main" appearance="primary" icon={<AddRegular />} onClick={addApp}>
                  {t("apps.addApp")}
                </Button>
                <Button appearance="subtle" icon={<FolderAddRegular />} onClick={addFolder} title={t("apps.addFolder")}>
                  {t("apps.addFolderShort")}
                </Button>
                <Button appearance="subtle" icon={<FolderRegular />} onClick={newFolder} title={t("apps.newFolder")}>
                  {t("apps.newFolderShort")}
                </Button>
                <Button appearance="subtle" icon={<LineHorizontal3Regular />} onClick={addSep} title={t("apps.addSep")}>
                  {t("apps.addSepShort")}
                </Button>
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  disabled={hasTrash}
                  onClick={addTrash}
                  title={t("apps.addTrash")}
                >
                  {t("apps.addTrashShort")}
                </Button>
              </div>
            </div>
            <div className="pin-toolbar-actions">
              {cfg.pinned.length > 0 && (
                <div className="pin-view-toggle" role="tablist" aria-label={t("apps.view")}>
                  <Button
                    appearance={view === "list" ? "primary" : "subtle"}
                    icon={<ListRegular />}
                    title={t("apps.viewList")}
                    aria-label={t("apps.viewList")}
                    aria-selected={view === "list"}
                    onClick={() => pickView("list")}
                  >
                    {t("apps.viewList")}
                  </Button>
                  <Button
                    appearance={view === "grid" ? "primary" : "subtle"}
                    icon={<GridRegular />}
                    title={t("apps.viewGrid")}
                    aria-label={t("apps.viewGrid")}
                    aria-selected={view === "grid"}
                    onClick={() => pickView("grid")}
                  >
                    {t("apps.viewGrid")}
                  </Button>
                </div>
              )}
              {cfg.pinned.length > 0 && (
                clearArm ? (
                  <div className="pin-clear-confirm">
                    <span>{t("apps.clearConfirm")}</span>
                    <Button appearance="primary" size="small" onClick={clearAll}>{t("apps.clearYes")}</Button>
                    <Button size="small" onClick={() => setClearArm(false)}>{t("apps.clearNo")}</Button>
                  </div>
                ) : (
                  <Button
                    className="pin-clear"
                    appearance="subtle"
                    icon={<DeleteRegular />}
                    onClick={() => setClearArm(true)}
                    title={t("apps.clearAll")}
                  >
                    {t("apps.clearAll")}
                  </Button>
                )
              )}
            </div>
          </div>

          {cfg.pinned.length > 0 && (
            <p className="muted pin-howto">{t("apps.howto")}</p>
          )}

          {cfg.pinned.length === 0 && (
            <div className="pin-empty-board">
              <img className="empty-capy" src="/brand/svg/isotype.svg" alt="" />
              <strong>{t("apps.empty")}</strong>
              <p className="muted">{t("apps.emptyHint")}</p>
              <div className="s-tips pin-empty-tips">
                <div className="s-tip"><img className="emo" src={emoSrc("mouse")} alt="" width="18" height="18" />{t("apps.tips1")}</div>
                <div className="s-tip"><img className="emo" src={emoSrc("star")} alt="" width="18" height="18" />{t("apps.tips2")}</div>
                <div className="s-tip"><img className="emo" src={emoSrc("puzzle")} alt="" width="18" height="18" />{t("apps.tips3")}</div>
              </div>
              <Button appearance="primary" icon={<AddRegular />} onClick={addApp}>
                {t("apps.addApp")}
              </Button>
            </div>
          )}

          {view === "grid" && displayPinned.length > 0 ? (
        <div className="pin-grid" ref={gridRef}>
          {displayPinned.map((item, i) => {
            const isGroup = item.kind === "group";
            const open = isGroup && openIds[item.id];
            const topKey = "top:" + item.id;
            return (
              <div key={item.id} data-idx={i}
                className={"pin-card" + (isGroup ? " is-group" : "") + (item.kind === "separator" ? " is-sep" : "") +
                  (mergeInto === i ? " merge-into" : "") + (open ? " open" : "")}>
                <button className="pin-card-grip" title={t("apps.drag")} aria-label={t("apps.drag")}
                  onPointerDown={startDragGrid(i)} dangerouslySetInnerHTML={{ __html: icon("grip") }} />
                <div className={"pin-card-body" + (isGroup && !open ? " clickable" : "")}
                  onClick={isGroup && !open ? () => toggleOpen(item.id) : undefined}
                  title={isGroup ? t("apps.editFolder") : item.path || ""}>
                  {item.kind !== "separator" && <PinThumb item={item} />}
                  {item.kind === "separator" ? (
                    <span className="pin-card-name">{t("apps.sep")}</span>
                  ) : (
                    <PinName
                      className={isGroup || renameKey === topKey ? "pin-card-name-edit" : "pin-card-name"}
                      value={item.name}
                      editing={renameKey === topKey}
                      title={item.path || t("apps.renameHint")}
                      onEdit={() => setRenameKey(topKey)}
                      onDone={() => setRenameKey(null)}
                      onChange={(name) =>
                        set({ pinned: cfg.pinned.map((p, k) => (k === i ? { ...p, name } : p)) })
                      }
                    />
                  )}
                  {isGroup && <span className="pin-count">{(item.children || []).length}</span>}
                  {missing[item.id] && (
                    <span
                      className="pin-missing"
                      title={t("apps.missing")}
                      dangerouslySetInnerHTML={{ __html: icon("alert") }}
                    />
                  )}
                </div>
                <div className="pin-card-actions">
                  {isGroup && (
                    <IconBtn
                      name={open ? "chevron-down" : "chevron-right"}
                      title={t("apps.editFolder")}
                      onClick={() => toggleOpen(item.id)}
                    />
                  )}
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <button type="button" className="pin-btn ico" title={t("apps.itemActions")} aria-label={t("apps.itemActions")}>
                        <span className="pin-btn-icon" dangerouslySetInnerHTML={{ __html: icon("more") }} />
                      </button>
                    </MenuTrigger>
                    <MenuPopover className="booki-menu-popover">
                      <MenuList>
                        {isGroup && <MenuItem onClick={() => setRenameKey(topKey)}>{t("apps.rename")}</MenuItem>}
                        {isGroup && <MenuItem onClick={() => ungroup(i)}>{t("group.ungroup")}</MenuItem>}
                        {item.kind === "widget" && (
                          <MenuItem onClick={() => setStyleFor({ type: "top", id: item.id, i })}>{t("w.styleTitle")}</MenuItem>
                        )}
                        {item.kind !== "separator" && item.kind !== "widget" && item.kind !== "trash" && !isGroup && (
                          <MenuItem onClick={() => setIconFor(i)}>{t("apps.changeIcon")}</MenuItem>
                        )}
                        {(item.kind === "app" || item.kind === "folder") && (
                          <MenuItem onClick={() => dockApi.openLocation(item.path)}>{t("apps.openLoc")}</MenuItem>
                        )}
                        {missing[item.id] && (item.kind === "app" || item.kind === "folder") && (
                          <MenuItem onClick={() => reassign(i)}>{t("apps.reassign")}</MenuItem>
                        )}
                        <MenuItem onClick={() => remove(i)}>
                          {removeArm === i ? t("group.removeConfirm") : t("apps.remove")}
                        </MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                </div>
                {open && (
                  <div className={"pin-card-kids" + (kidOut === i ? " taking-out" : "")}>
                    {(item.children || []).map((c) => {
                      const childKey = "child:" + item.id + ":" + c.id;
                      return (
                        <div key={c.id} className="pin-kid" title={t("apps.dragKid")}
                          onPointerDown={startKidDrag(i, c.id)}
                          onContextMenu={(e) => openKidMenu(e, i, c.id)}>
                          <PinThumb item={c} />
                          <PinName
                            className="pin-kid-rename"
                            value={c.name}
                            editing={renameKey === childKey}
                            title={c.path || t("apps.renameHint")}
                            onEdit={() => setRenameKey(childKey)}
                            onDone={() => setRenameKey(null)}
                            onChange={(name) => renameChild(i, c.id, name)}
                          />
                          <span className="pin-kid-acts" onPointerDown={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="pin-kid-edit"
                              title={t("group.takeOut")}
                              onClick={(e) => { e.stopPropagation(); takeOutChild(i, c.id); }}
                              dangerouslySetInnerHTML={{ __html: icon("take-out") }}
                            />
                          </span>
                        </div>
                      );
                    })}
                    <button type="button" className="pin-kid pin-kid-add" title={t("apps.addToFolder")}
                      onClick={() => addToFolder(i, "app")}>
                      <span dangerouslySetInnerHTML={{ __html: icon("plus") }} />
                    </button>
                    <button type="button" className="pin-kid pin-kid-add" title={t("m.addFolder")}
                      onClick={() => addToFolder(i, "folder")}>
                      <span dangerouslySetInnerHTML={{ __html: icon("folder") }} />
                    </button>
                    {!kidsHintDismissed && (
                      <div className="pin-kids-hint">
                        <span>{t("apps.kidsHint")}</span>
                        <button type="button" className="pin-kids-hint-x" onClick={dismissKidsHint} aria-label={t("apps.dismissHint")}>×</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
          ) : displayPinned.length > 0 ? (
      <ul className="pin-list" ref={listRef}>
        {displayPinned.flatMap((item, i) => {
          const isGroup = item.kind === "group";
          const open = isGroup && openIds[item.id];
          const topKey = "top:" + item.id;
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
                {item.kind === "separator" ? (
                  <span className="pin-name">{t("apps.sep")}</span>
                ) : (
                  <PinName
                    value={item.name}
                    editing={renameKey === topKey}
                    title={item.path || t("apps.renameHint")}
                    onEdit={() => setRenameKey(topKey)}
                    onDone={() => setRenameKey(null)}
                    onChange={(name) =>
                      set({ pinned: cfg.pinned.map((p, k) => (k === i ? { ...p, name } : p)) })
                    }
                  />
                )}
                {missing[item.id] && (
                  <span className="pin-missing" title={t("apps.missing")}>
                    <span dangerouslySetInnerHTML={{ __html: icon("alert") }} />
                    {" "}{t("apps.missingShort")}
                  </span>
                )}
                {isGroup && <span className="pin-count">{(item.children || []).length}</span>}
              </span>
              <span className="pin-actions">
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <button type="button" className="pin-btn ico" title={t("apps.itemActions")} aria-label={t("apps.itemActions")}>
                      <span className="pin-btn-icon" dangerouslySetInnerHTML={{ __html: icon("more") }} />
                    </button>
                  </MenuTrigger>
                  <MenuPopover className="booki-menu-popover">
                    <MenuList>
                      {item.kind !== "separator" && (
                        <MenuItem onClick={() => setRenameKey(topKey)}>{t("apps.rename")}</MenuItem>
                      )}
                      {isGroup && <MenuItem onClick={() => ungroup(i)}>{t("group.ungroup")}</MenuItem>}
                      {item.kind === "widget" && (
                        <MenuItem onClick={() => setStyleFor({ type: "top", id: item.id, i })}>{t("w.styleTitle")}</MenuItem>
                      )}
                      {item.kind !== "separator" && item.kind !== "widget" && item.kind !== "trash" && !isGroup && (
                        <MenuItem onClick={() => setIconFor(i)}>{t("apps.changeIcon")}</MenuItem>
                      )}
                      {missing[item.id] && (item.kind === "app" || item.kind === "folder") && (
                        <MenuItem onClick={() => reassign(i)}>{t("apps.reassign")}</MenuItem>
                      )}
                      {(item.kind === "app" || item.kind === "folder") && (
                        <MenuItem onClick={() => dockApi.openLocation(item.path)}>{t("apps.openLoc")}</MenuItem>
                      )}
                      <MenuItem onClick={() => remove(i)}>
                        {removeArm === i ? t("group.removeConfirm") : t("apps.remove")}
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </span>
            </li>,
          ];
          if (open) {
            (item.children || []).forEach((c, ci) => {
              const childKey = "child:" + item.id + ":" + c.id;
              rows.push(
                <li key={item.id + ":" + c.id} className="pin-item pin-child pin-child-item" data-folder={i}>
                  <span className="pin-left">
                    <button className="pin-handle" title={t("apps.drag")} aria-label={t("apps.drag")}
                      onPointerDown={startDragChild(i, ci)} dangerouslySetInnerHTML={{ __html: icon("grip") }} />
                    <PinThumb item={c} />
                    <PinName
                      value={c.name}
                      editing={renameKey === childKey}
                      title={c.path || t("apps.renameHint")}
                      onEdit={() => setRenameKey(childKey)}
                      onDone={() => setRenameKey(null)}
                      onChange={(name) => renameChild(i, c.id, name)}
                    />
                  </span>
                  <span className="pin-actions">
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <button type="button" className="pin-btn ico" title={t("apps.itemActions")} aria-label={t("apps.itemActions")}>
                          <span className="pin-btn-icon" dangerouslySetInnerHTML={{ __html: icon("more") }} />
                        </button>
                      </MenuTrigger>
                      <MenuPopover className="booki-menu-popover">
                        <MenuList>
                          <MenuItem onClick={() => setRenameKey(childKey)}>{t("apps.rename")}</MenuItem>
                          {c.kind === "widget" && (
                            <MenuItem onClick={() => setStyleFor({ type: "child", groupId: item.id, gi: i, id: c.id })}>
                              {t("w.styleTitle")}
                            </MenuItem>
                          )}
                          <MenuItem onClick={() => takeOutChild(i, c.id)}>{t("group.takeOut")}</MenuItem>
                          <MenuItem onClick={() => removeChild(i, c.id)}>{t("apps.remove")}</MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  </span>
                </li>
              );
            });
            rows.push(
              <li key={item.id + ":add"} className="pin-item pin-child pin-add-row">
                <button type="button" className="s-btn s-btn-soft pin-add-btn" onClick={() => addToFolder(i, "app")}>
                  <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("folder-plus") }} />
                  <span>{t("apps.addToFolder")}</span>
                </button>
                <button type="button" className="s-btn s-btn-soft pin-add-btn" onClick={() => addToFolder(i, "folder")}>
                  <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("folder") }} />
                  <span>{t("m.addFolder")}</span>
                </button>
                {!kidsHintDismissed && (
                  <span className="pin-kids-hint muted">
                    {t("apps.kidsHint")}
                    <button type="button" className="pin-kids-hint-x" onClick={dismissKidsHint} aria-label={t("apps.dismissHint")}>×</button>
                  </span>
                )}
              </li>
            );
          }
          return rows;
        })}
      </ul>
          ) : null}
        </div>
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
      <CollapsibleSection
        title={t("apps.web")}
        icon="external"
        hint={t("apps.webHint")}
        defaultOpen={false}
      >
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
      </CollapsibleSection>
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
        <div ref={kidMenuRef} className="pin-kid-menu" role="menu" aria-label={t("apps.itemActions")} style={{ left: kidMenu.x, top: kidMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}>
          <button role="menuitem" onClick={() => {
            const g = cfg.pinned[kidMenu.gi];
            if (g) setRenameKey("child:" + g.id + ":" + kidMenu.id);
            setKidMenu(null);
          }}>
            <span dangerouslySetInnerHTML={{ __html: icon("pencil") }} />{t("apps.rename")}
          </button>
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
      <p className="muted" style={{ marginTop: 10, marginBottom: 4 }}>{t("sc.other")}</p>
      <ul className="muted-list">
        <li>{t("sc.w1")}</li>
        <li>{t("sc.w2")}</li>
        <li>{t("sc.w3")}</li>
        <li>{t("sc.w4")}</li>
      </ul>
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

// Official marks from assets/brand/svg — kept offline with the rest of the UI.
const DONATE = [
  { key: "btc", name: "Bitcoin", src: "/brand/svg/bitcoin.svg",
    addr: "bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3" },
  { key: "sol", name: "Solana", src: "/brand/svg/solana.svg",
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
    <>
      <p className="muted">{t("ab.freeText")}</p>
      <p className="muted">{t("ab.donateHint")}</p>
      <div className="donate">
        {DONATE.map((d) => (
          <div key={d.key} className="donate-row">
            <span className="donate-ico"><img src={d.src} alt="" width="30" height="30" /></span>
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
    </>
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
    <>
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
    </>
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
      <PageHeader icon="help" title={t("faq.title")}>{t("faq.intro")}</PageHeader>

      <SettingsSection title={null} className="faq-questions-section">
      <div className="faq-list">
        {items.map((k) => (
          <details className="faq-item" key={k}>
            <summary>{t(`faq.q.${k}`)}</summary>
            <p>{t(`faq.a.${k}`)}</p>
          </details>
        ))}
      </div>
      </SettingsSection>

      <SettingsSection title={t("faq.transparency")} icon="info">
      <div className="faq-facts">
        <p><strong>{t("faq.fact.dataTitle")}</strong><br />
          <code>%APPDATA%\Booki\config.json</code> — {t("faq.fact.data")}</p>
        <p><strong>{t("faq.fact.netTitle")}</strong><br />{t("faq.fact.net")}</p>
        <p><strong>{t("faq.fact.startupTitle")}</strong><br />
          <code>HKCU\…\Run\Booki</code> — {t("faq.fact.startup")}</p>
      </div>

      <div className="s-credits faq-links">
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
      </SettingsSection>
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
    <>
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
    </>
  );
}

// The "everything general" tab: system toggles, language, shortcuts, updates
// and backup — anything that isn't about how the dock looks or moves.
function General({ cfg, set, onWhatsNew }) {
  const [autostart, setAutostart] = useState(!!cfg.autostart);
  const [backupMsg, setBackupMsg] = useState("");
  useEffect(() => {
    dockApi.getAutostart().then((v) => setAutostart(!!v));
  }, []);
  const flashBackup = (msg) => {
    setBackupMsg(msg);
    clearTimeout(flashBackup._t);
    flashBackup._t = setTimeout(() => setBackupMsg(""), 3200);
  };
  return (
    <>
      <PageHeader icon="settings" title={t("gen.title")}>{t("gen.hint")}</PageHeader>

      <SettingsSection title={t("gp.system")} icon="power" hint={t("gp.systemHint")}>
        <Row label={t("ap.language")} hint={t("gen.langHint")}>
          <Dropdown
            className="s-lang-dropdown"
            value={LANG_OPTIONS.find((o) => o.value === (cfg.language || "system"))?.label || t("lang.system")}
            selectedOptions={[cfg.language || "system"]}
            onOptionSelect={(_e, data) => set({ language: data.optionValue })}
          >
            {LANG_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value}>{o.key ? t(o.key) : o.label}</Option>
            ))}
          </Dropdown>
        </Row>
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
      </SettingsSection>

      <SettingsSection title={t("ab.updates")} icon="sparkles" hint={t("ab.updatesHint")}>
        <UpdatesCard onWhatsNew={onWhatsNew} />
      </SettingsSection>

      <CollapsibleSection
        title={t("sc.title")}
        icon="keyboard"
        hint={t("sc.hint")}
        defaultOpen={false}
      >
        <ShortcutsSection cfg={cfg} set={set} />
      </CollapsibleSection>

      <CollapsibleSection
        title={t("gen.more")}
        icon="sliders"
        hint={t("gen.moreHint")}
        defaultOpen={false}
      >
        <div className="capture-row">
          <Toggle label={t("gen.captureVisible")} hint={t("gen.captureVisibleHint")}
            checked={!!cfg.captureVisible}
            onChange={(v) => set({ captureVisible: v })} />
          <HelpTip text={t("gen.captureHelp")} />
        </div>
        <Toggle label={t("gen.ctxMenu")} hint={t("gen.ctxMenuHint")}
          checked={cfg.contextMenu !== false}
          onChange={(v) => set({ contextMenu: v })} />
      </CollapsibleSection>

      <CollapsibleSection
        title={t("ap.backup")}
        icon="copy"
        hint={t("ap.backupHint")}
        defaultOpen={false}
      >
        <p className="muted" style={{ margin: "0 0 10px" }}>{t("ap.backupKeep")}</p>
        <div className="s-actions" style={{ margin: 0 }}>
          <Button onClick={async () => {
            try {
              const p = await pickSavePath("booki-config.json");
              if (!p) return;
              await dockApi.exportConfig(p);
              flashBackup(t("ap.backupExported"));
            } catch (_) {
              flashBackup(t("ap.backupError"));
            }
          }}>{t("ap.export")}</Button>
          <Button appearance="secondary" onClick={async () => {
            try {
              const p = await pickJsonFile();
              if (!p) return;
              if (!window.confirm(t("ap.backupImportConfirm"))) return;
              const fresh = await dockApi.importConfig(p);
              if (fresh) {
                set(fresh);
                flashBackup(t("ap.backupImported"));
              } else {
                flashBackup(t("ap.backupError"));
              }
            } catch (_) {
              flashBackup(t("ap.backupError"));
            }
          }}>{t("ap.import")}</Button>
        </div>
        {backupMsg ? <p className="muted" style={{ marginTop: 8 }}>{backupMsg}</p> : null}
      </CollapsibleSection>
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
      <PageHeader icon="info" title={t("ab.title")}>{t("ab.tagline")}</PageHeader>
      <SettingsSection title={null} className="about-identity-section">
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
      </SettingsSection>

      <SettingsSection title={t("ab.free")} icon="sparkles" className="about-project-section">
      <DonateCard />

      {/* A quick way back to the changelog; full update controls live in General. */}
      <button className="s-btn s-btn-soft s-btn-ico" style={{ marginTop: 12 }} onClick={onWhatsNew}>
        <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon("sparkles") }} />
        <span>{t("ab.whatsNew")}</span>
      </button>
      </SettingsSection>

      <SettingsSection title={t("ab.danger")} icon="trash" className="about-reset-section">
      <ResetZone onReset={onReset} />

      <p className="muted" style={{ marginTop: 14 }}>{t("ab.made")}</p>
      </SettingsSection>
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
  const fluentTheme = useMemo(() => buildFluentTheme(cfg?.accent, cfg?.theme), [cfg?.accent, cfg?.theme]);
  // One-time "start here" banner — persisted in config (not only localStorage),
  // so a WebView data wipe / reinstall with kept AppData still remembers it.
  const dismissIntro = () => {
    try { localStorage.setItem("booki.introSeen", "1"); } catch (_) {}
    set({ settingsIntroSeen: true });
  };
  const saveTimer = useRef(null);
  const cfgRef = useRef(null);
  const dirtyKeys = useRef(new Set());
  const afterSaveCb = useRef(null);
  cfgRef.current = cfg;

  // Merge only the keys Settings actually touched onto a fresh disk snapshot so
  // a debounced slider save cannot wipe pins the dock wrote a moment earlier.
  const flushSave = async () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const keys = [...dirtyKeys.current];
    dirtyKeys.current.clear();
    const cb = afterSaveCb.current;
    afterSaveCb.current = null;
    if (!keys.length) return;
    const snap = cfgRef.current;
    if (!snap) return;
    setSaveState("saving");
    try {
      const disk = (await configApi.get()) || {};
      const toSave = { ...disk };
      for (const k of keys) {
        if (k in snap) toSave[k] = snap[k];
      }
      if (keys.includes("pinned")) {
        toSave.pinned = normalizePinned(snap.pinned || [], { keepEmpty: true });
      }
      // Sticky one-way progress flags (also enforced in Rust save).
      toSave.onboarded = !!(snap.onboarded || disk.onboarded);
      toSave.settingsIntroSeen = !!(snap.settingsIntroSeen || disk.settingsIntroSeen);
      toSave.seenVersion = snap.seenVersion || disk.seenVersion || "";
      await configApi.save(toSave);
      await emitConfigChanged();
      cfgRef.current = toSave;
      setCfg((prev) => {
        if (!prev) return toSave;
        // Keep any edits typed while the save was in flight.
        if (dirtyKeys.current.size) return prev;
        return { ...prev, ...toSave };
      });
      setSaveState("saved");
      if (typeof cb === "function") cb(toSave);
    } catch (_) {
      // Re-queue failed keys so the next edit (or close) retries.
      for (const k of keys) dirtyKeys.current.add(k);
      setSaveState("error");
    }
  };

  // Flush pending edits on close — never drop a slider/toggle by clearing the timer.
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (dirtyKeys.current.size) {
      // Fire-and-forget sync path: window may be closing.
      flushSave();
    }
  }, []);

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
      // Migrate legacy localStorage intro flag into persisted config once.
      let next = c;
      try {
        if (!c.settingsIntroSeen && localStorage.getItem("booki.introSeen") === "1") {
          next = { ...c, settingsIntroSeen: true };
          configApi.save(next).catch(() => {});
        }
      } catch (_) {}
      setCfg(next);
      applyTheme(next);
      applySurfaceVars(next);
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

  const set = (patch, opts = {}) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      // Keep empty staging groups in Settings; dock persist dissolves them.
      if (patch.pinned) next.pinned = normalizePinned(patch.pinned, { keepEmpty: true });
      for (const k of Object.keys(patch)) dirtyKeys.current.add(k);
      cfgRef.current = next;
      // Switching language may need its dictionary → load then re-render.
      if (prev && prev.language !== next.language) {
        ensureLang(next.language).then(() => {
          setLang(next.language);
          setCfg((c) => ({ ...c }));
        });
      } else {
        setLang(next.language);
      }
      applyTheme(next);
      applySurfaceVars(next);
      setSaveState("saving");
      clearTimeout(saveTimer.current);
      if (typeof opts.afterSave === "function") afterSaveCb.current = opts.afterSave;
      // flush:0 — notch size/surface must hit disk before notch_preview reads config.
      const delay = opts.flush ? 0 : 120;
      saveTimer.current = setTimeout(() => {
        flushSave();
      }, delay);
      return next;
    });
  };

  const reset = async () => {
    const fresh = await configApi.reset();
    if (fresh) {
      setCfg(fresh);
      applyTheme(fresh);
      applySurfaceVars(fresh);
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

  // Reflect dock-side changes without clobbering in-progress Settings edits.
  // Always pull one-way progress flags (onboarding / changelog) so a later
  // Settings save cannot rewrite them back to false/"".
  useEffect(() => {
    let un;
    onConfigChanged(() => {
      configApi.get().then((c) =>
        setCfg((prev) => {
          if (!prev) return c;
          const next = {
            ...prev,
            onboarded: prev.onboarded || c.onboarded,
            settingsIntroSeen: prev.settingsIntroSeen || c.settingsIntroSeen,
            seenVersion: c.seenVersion || prev.seenVersion,
          };
          // Do not stomp pins the user is editing in Settings right now.
          if (!dirtyKeys.current.has("pinned")) next.pinned = c.pinned;
          cfgRef.current = next;
          return next;
        })
      );
    }).then((u) => (un = u));
    return () => un && un();
  }, []);

  if (!cfg) {
    return (
      <FluentProvider theme={buildFluentTheme(null, "system")}>
        <SettingsSkeleton />
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={fluentTheme}>
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
          {!cfg.settingsIntroSeen && !(typeof localStorage !== "undefined" && localStorage.getItem("booki.introSeen") === "1") && (
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
    </FluentProvider>
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
