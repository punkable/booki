/* Booki Dock — Settings (React). Modern sidebar + tabbed panels.
   Shares the config bridge in api.js; changes apply to the dock live. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { createPortal } from "react-dom";
import {
  config as configApi,
  dock as dockApi,
  pickSavePath,
  emitConfigChanged,
  onConfigChanged,
  onShowChangelog,
  onShowTab,
  closeSelf,
  invoke,
  onCloseRequest,
} from "./api.js";
import { parseConfigConflict } from "./settings/config-conflicts.js";
import { showBookiMenu } from "./native-context-menu.js";
import { isTextEditor } from "./dock/context-menu.js";
import { currentRelease, previousReleases } from "./release-notes.js";
import { FinishPicker } from "./settings/finish-picker.jsx";
import { ProfilesPage } from "./settings/profiles.jsx";
import { IconPickerModal } from "./settings/icon-picker.jsx";
import { NativeBackdrop } from "./settings/native-backdrop.jsx";
import { RecoveryNotice } from "./settings/recovery-notice.jsx";
import { WidgetsWorkspace } from "./settings/widgets-workspace.jsx";
import { LibraryWorkspace } from "./settings/library-workspace.jsx";
import { SettingsBoundary } from "./settings/error-boundary.jsx";
import { Dashboard, ScenarioPicker } from "./settings/dashboard.jsx";
import { DockPreview, WidgetPreview } from "./settings/dock-preview.jsx";
import { resolveNotchMode } from "./notch-mode.js";
import { findSettings } from "./settings/search.js";
import { emoSrc } from "./emoji.js";
import {
  Dropdown,
  Option,
  Row,
  Toggle,
  Slider,
  SegmentedControl,
  PageHeader,
  SettingsSection,
  CollapsibleSection,
  SectionTitle,
  useModalControls,
  ArrowUndo24Regular,
  Flash24Regular,
  Info24Regular,
  Search24Regular,
} from "./settings/ui.jsx";
import {
  WIDGET_META,
  widgetDisplayName as widgetDisplayNameShared,
} from "./widgets-meta.js";

const CHANGELOG_ICONS = {
  sparkles: () => <span dangerouslySetInnerHTML={{ __html: icon("sparkles") }} />,
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
  if (name && /\p{Extended_Pictographic}/u.test(name)) {
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
  SURFACE_TINT_PRESETS,
  resolveSurfaceStyle,
  applySurfaceVars,
} from "./surface.js";
import { normalizeGroups as normalizePinned } from "./pins.js";
import { UpdatesCard } from "./settings/updates.jsx";
import { updates } from "./update.js";
import { t, setLang, ensureLang } from "./i18n.js";
import { icon } from "./icons.js";

// Small icon button used across the Apps list.
const ACCENTS = [
  ["ac.tan", "#dfaa75"],
  ["ac.amber", "#ffbe0b"],
  ["ac.orange", "#fb5607"],
  ["ac.pink", "#ff006e"],
  ["ac.violet", "#8338ec"],
  ["ac.blue", "#3a86ff"],
  ["ac.green", "#2ecc71"],
];

const LANG_OPTIONS = [
  { value: "system", key: "lang.system" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

// Sidebar sections: [id, label key, icon, tile colour]. Blank entries are
// visual gaps between groups of sections.
const TABS = [
  ["home", "overhaul.home", "grid", "#dfaa75"],
  ["dock", "tab.dock", "app", "#5e5ce6"],
  ["appearance", "tab.appearance", "palette", "#0a84ff"],
  ["widgets", "tab.widgets", "zap", "#ff375f"],
  ["apps", "overhaul.appsFolders", "folder", "#ff9f0a"],
  ["profiles", "tab.profiles", "copy", "#ac8e68"],
  null,
  ["general", "overhaul.system", "settings", "#8e8e93"],
  ["faq", "tab.faq", "help", "#8e8e93"],
  ["about", "tab.about", "info", "#636366"],
];
const LEGACY_TABS = ["autohide", "notch", "shortcuts", "clipboard"];
const NAV_PARENT = { autohide: "dock", notch: "dock", shortcuts: "general", clipboard: "widgets" };
const TAB_IDS = TABS.filter(Boolean).map(([id]) => id);

function widgetDisplayName(widget) {
  return widgetDisplayNameShared(widget, t);
}

// Scan the Start Menu once per settings session, then reuse — the scan +
// icon extraction is costly and the Apps panel remounts on every tab switch.
let _installedApps = null;
let _installedAt = 0;
function installedAppsOnce(force = false) {
  if (force || !_installedApps || Date.now() - _installedAt > 60000) {
    _installedAt = Date.now();
    _installedApps = dockApi.listInstalledApps(force).catch((error) => {
      _installedApps = null;
      throw error;
    });
  }
  return _installedApps;
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
function MiniDockPreview({ cfg }) { return <DockPreview cfg={cfg} />; }

function AccentPicker({ value, onChange }) {
  const v = (value || "").toLowerCase();
  const isPreset = ACCENTS.some(([, val]) => val.toLowerCase() === v);
  return (
    <div className="accent-picker">
      <div className="accent-swatches">
        {ACCENTS.map(([nameKey, val]) => (
          <button
            key={val}
            type="button"
            className={"accent-sw" + (v === val.toLowerCase() ? " active" : "")}
            style={{ "--sw": val }}
            title={t(nameKey)}
            aria-label={t(nameKey)}
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
  const flushSurface = (patch) => set(patch, { flush: true, afterSave: () => dockApi.notchPreview() });
  return (
    <>
      <PageHeader title={t("ap.title")}>{t("ap.hint")}</PageHeader>
      <MiniDockPreview cfg={cfg} />

      <SettingsSection>
        <Row label={t("ap.theme")}>
          <SegmentedControl
            value={cfg.theme || "system"}
            onChange={(v) => set({ theme: v })}
            options={[
              { value: "system", label: t("theme.system") },
              { value: "light", label: t("theme.light") },
              { value: "dark", label: t("theme.dark") },
              { value: "auto", label: t("theme.auto") },
            ]}
          />
        </Row>
        <Row label={t("ap.accent")} hint={t("ap.accentHint")}>
          <AccentPicker value={cfg.accent} onChange={(v) => set({ accent: v })} />
        </Row>
      </SettingsSection>

      <SettingsSection title={t("premium.finishes")} hint={t("premium.finishesHint")}>
        <FinishPicker cfg={cfg} set={flushSurface} />
        <Toggle label={t("overhaul.reduceTransparency")} hint={t("overhaul.reduceTransparencyHint")} checked={!!cfg.reduceTransparency} onChange={(v) => flushSurface({ reduceTransparency: v })} />
        <CollapsibleSection title={t("next.advanced")} defaultOpen={false}>
        {(!solidSurface && !cfg.reduceTransparency) && <Toggle
          checked={cfg.nativeMaterial !== false}
          onChange={(v) => flushSurface({ nativeMaterial: v })}
          label={t("ap.nativeMaterial")}
          hint={t("ap.nativeMaterialHint")}
        />}
        <Row label={t("ap.surfaceTint")} hint={t("ap.surfaceTintHint")}>
          <SurfaceTintPicker
            value={cfg.surfaceTint || ""}
            accent={cfg.accent}
            autoBlack={surface === "tinted"}
            onChange={(v) => flushSurface({ surfaceTint: v })}
          />
        </Row>
        {!solidSurface && !cfg.reduceTransparency && <Row label={t("ap.solidity")} hint={t("ap.solidityHint")}>
          <Slider
            value={cfg.materialStrength ?? 80}
            min={0}
            max={100}
            step={1}
            fmt={(v) => `${v}%`}
            onChange={(v) => flushSurface({ materialStrength: v })}
          />
        </Row>}
        </CollapsibleSection>

      </SettingsSection>

      <SettingsSection title={t("gp.size")} hint={t("gp.sizeHint")}>
        <Row label={t("ap.iconSize")}>
          <Slider value={cfg.iconSize} min={28} max={80} step={4} fmt={(v) => `${v}px`} onChange={(v) => set({ iconSize: v })} />
        </Row>
        <Row label={t("ap.spacing")}>
          <Slider value={cfg.spacing} min={0} max={20} step={1} fmt={(v) => `${v}px`} onChange={(v) => set({ spacing: v })} />
        </Row>
        <Row label={t("ap.radius")} hint={t("ap.radiusHint")}>
          <Slider
            value={cfg.cornerRadius ?? 12}
            min={0}
            max={24}
            step={1}
            fmt={(v) => `${v}px`}
            onChange={(v) => set({ cornerRadius: v })}
          />
        </Row>
        <Toggle label={t("ap.compact")} hint={t("ap.compactHint")} checked={!!cfg.compact} onChange={(v) => set({ compact: v })} />
      </SettingsSection>
    </>
  );
}

// Re-apply the dock's placement once the saved value is on disk.
const afterPlacement = (cfg) => ({
  flush: true,
  afterSave: () => {
    dockApi.reposition(cfg.edge || "bottom").catch(() => {});
    dockApi.notchPreview();
  },
});

function DockPage({ cfg, set }) {
  const [monitors, setMonitors] = useState([]);
  useEffect(() => {
    dockApi.listMonitors().then((m) => setMonitors(m || []));
  }, []);
  return (
    <>
      <PageHeader title={t("tab.dock")}>{t("gp.dockHint")}</PageHeader>
      <MiniDockPreview cfg={cfg} />
      <SettingsSection title={t("overhaul.scenarios")} hint={t("overhaul.scenariosHint")}><ScenarioPicker cfg={cfg} set={set} /></SettingsSection>

      <SettingsSection title={t("be.position")} hint={t("be.positionHint")}>
        <div className="ui-row ui-row-stack">
          <PositionPicker cfg={cfg} set={set} />
        </div>
        {monitors.length > 1 && (
          <Row label={t("be.monitor")}>
            <MonitorPicker value={cfg.monitor} monitors={monitors} onChange={(v) => set({ monitor: v, monitorName: v < 0 ? "" : monitors.find((m) => m.index === v)?.name || "" }, afterPlacement(cfg))} />
          </Row>
        )}
        <Row label={t("be.edgeGap")} hint={t("be.edgeGapHint")}>
          <Slider
            value={cfg.edgeGap ?? 12}
            min={0}
            max={72}
            step={2}
            fmt={(v) => (v === 0 ? t("be.edgeGapFlush") : `${v}px`)}
            onChange={(v) => set({ edgeGap: v }, afterPlacement(cfg))}
          />
        </Row>
      </SettingsSection>

      <CollapsibleSection title={t("gp.interaction")} defaultOpen={false}>
      <SettingsSection>
        <Row label={t("overhaul.overflow")}><SegmentedControl value={cfg.overflowMode || "adapt"} onChange={(v) => set({ overflowMode: v })} options={[{ value: "adapt", label: t("overhaul.adapt") }, { value: "scroll", label: t("overhaul.scroll") }]} /></Row>
        <Toggle label={t("be.magnify")} checked={cfg.magnification} onChange={(v) => set({ magnification: v })} />
        {cfg.magnification && (
          <>
            <Row label={t("be.zoom")} hint={t("be.zoomHint")}>
              <Slider
                value={Math.min(150, Math.max(110, Math.round((cfg.zoom || 1.25) * 100)))}
                min={110}
                max={150}
                step={5}
                fmt={(v) => `${v}%`}
                onChange={(v) => set({ zoom: v / 100 })}
              />
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
          </>
        )}
        <Toggle label={t("be.showLabels")} checked={cfg.showLabels} onChange={(v) => set({ showLabels: v })} />
        <Toggle label={t("be.showIndicators")} checked={cfg.showIndicators} onChange={(v) => set({ showIndicators: v })} />
        <Toggle
          label={t("be.focusRunning")}
          hint={t("be.focusRunningHint")}
          checked={!!cfg.focusIfRunning}
          onChange={(v) => set({ focusIfRunning: v })}
        />
        <Toggle
          label={t("be.alwaysOnTop")}
          hint={t("be.alwaysOnTopHint")}
          checked={cfg.alwaysOnTop !== false}
          onChange={(v) => {
            set({ alwaysOnTop: v });
            dockApi.setAlwaysOnTop(v);
          }}
        />
      </SettingsSection>
      </CollapsibleSection>
    </>
  );
}

function AutoHidePage({ cfg, set, embedded = false }) {
  const hideOn = cfg.autoHideMode !== "off";
  return (
    <>
      {!embedded && <PageHeader title={t("tab.autohide")}>{t("be.autoHideHint")}</PageHeader>}

      <SettingsSection>
        <Row label={t("be.autoHide")}>
          <SegmentedControl
            value={cfg.autoHideMode || "smart"}
            onChange={(v) => {
              // "Never" has no notch — also clear always-visible so the dock
              // doesn't keep stacking clearance for an orphaned notch.
              if (v === "off") set({ autoHideMode: v, notchAlwaysVisible: false });
              else set({ autoHideMode: v });
            }}
            options={[
              { value: "off", label: t("hide.offShort") },
              { value: "smart", label: t("hide.smartShort") },
              { value: "edge", label: t("hide.edgeShort") },
            ]}
          />
        </Row>
        {hideOn && (
          <Row label={t("be.hideDelay")} hint={t("be.hideDelayHint")}>
            <Slider
              value={cfg.autoHideDelay ?? 650}
              min={0}
              max={2500}
              step={50}
              fmt={(v) => `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 2)} s`}
              onChange={(v) => set({ autoHideDelay: v })}
            />
          </Row>
        )}
        <Toggle
          label={t("be.hideInFullscreen")}
          hint={t("be.hideInFullscreenHint")}
          checked={cfg.hideInFullscreen !== false}
          onChange={(v) => set({ hideInFullscreen: v })}
        />
      </SettingsSection>

      <CollapsibleSection title={t("gp.taskbar")} defaultOpen={false}>
      <SettingsSection title={t("gp.taskbar")} hint={cfg.taskbarFollow !== false ? t("be.taskbarWindhawkTip") : null}>
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
          </>
        )}
      </SettingsSection>
      </CollapsibleSection>
    </>
  );
}

function NotchPage({ cfg, set, embedded = false }) {
  const hideOn = cfg.autoHideMode !== "off";
  const mode = resolveNotchMode(cfg);
  return (
    <>
      {!embedded && <PageHeader title={t("tab.notch")}>{t("gp.notchHint")}</PageHeader>}

      <SettingsSection
        hint={mode === "floating" ? t("be.notchModeFloatingHint") : mode === "smart" ? t("be.notchModeSmartHint") : t("be.notchModeAttachedHint")}
      >
        <Row label={t("be.notchMode")}>
          <SegmentedControl
            value={mode}
            onChange={(v) =>
              set(
                {
                  notchMode: v,
                  // Keep legacy keys in sync so old fallbacks don't revive the
                  // multi-notch app list or the peek toggle.
                  notchPeek: v !== "floating",
                  multiNotchEnabled: false,
                  multiNotchApps: [],
                },
                afterPlacement(cfg)
              )
            }
            options={[
              { value: "attached", label: t("be.notchModeAttached") },
              { value: "floating", label: t("be.notchModeFloating") },
              { value: "smart", label: t("be.notchModeSmart") },
            ]}
          />
        </Row>
        <Row label={t("ap.notchSize")} hint={t("ap.notchSizeHint")}>
          <Slider
            value={Math.round((Number(cfg.notchScale) || 1) * 100)}
            min={70}
            max={150}
            step={5}
            fmt={(v) => `${v}%`}
            onChange={(v) => set({ notchScale: v / 100 }, { flush: true, afterSave: () => dockApi.notchPreview() })}
          />
        </Row>
      </SettingsSection>

      <CollapsibleSection title={t("gp.advancedNotch")} defaultOpen={false}>
      <SettingsSection hint={!hideOn ? t("be.notchNeedsHide") : cfg.notchAlwaysVisible ? t("be.notchClearanceTip") : null}>
        {hideOn && (
          <>
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
            <Toggle
              label={t("be.notchAlwaysVisible")}
              hint={t("be.notchAlwaysVisibleHint")}
              checked={!!cfg.notchAlwaysVisible}
              onChange={(v) => set({ notchAlwaysVisible: v }, afterPlacement(cfg))}
            />
          </>
        )}
      </SettingsSection>
      </CollapsibleSection>
    </>
  );
}

function ClipboardPage({ cfg, set }) {
  return (
    <>
      <PageHeader title={t("tab.clipboard")}>{t("clip.howPrivate")}</PageHeader>
      <SettingsSection>
        <ClipboardSettingsPanel cfg={cfg} set={set} />
      </SettingsSection>
    </>
  );
}

function ShortcutsPage({ cfg, set }) {
  return (
    <>
      <PageHeader title={t("tab.shortcuts")}>{t("sc.hint")}</PageHeader>
      <SettingsSection>
        <ShortcutsSection cfg={cfg} set={set} />
      </SettingsSection>
    </>
  );
}

// Modal to choose a pin's icon: built-in library (with styles), upload an image,
// or reset to the app's real icon.
function ClipboardSettingsPanel({ cfg, set }) {
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => dockApi.clipboardStorageFailed().then((failed) => { if (active) setStorageFailed(!!failed); }).catch(() => {});
    refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [cfg.clipboardPersist]);
  return (
    <div className="clip-policy clip-policy-embedded">
      {storageFailed && <p role="alert">{t("clip.storageFailed")}</p>}
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
function WidgetStyleFields({ item, accent, cfg, set, onChange }) {
  const st = item.style || {};
  const variant = st.variant || "glass";
  const meta = WIDGET_META[item.widget] || { emoji: "puzzle", accent, desc: "widget.defaultDesc" };
  const set1 = (patch) => onChange({ ...st, ...patch });
  return (
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
        <div className="widget-editor-preview"><WidgetPreview widget={item.widget} style={st} size={56} /></div>
        <SectionTitle name="sparkles">{t("w.behavior")}</SectionTitle>
        {["timer", "tasks", "calendar", "weather"].includes(item.widget) && <p className="muted">{t("overhaul.utilityHint")}</p>}
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
        ) : !["notes", "timer", "tasks", "calendar", "weather"].includes(item.widget) ? (
          <div className="widget-no-extra">
            <span dangerouslySetInnerHTML={{ __html: icon("sparkles") }} />
            <div>
              <strong>{t("w.smartDefaults")}</strong>
              <p>{t("w.smartDefaultsHint")}</p>
            </div>
          </div>
        ) : null}
        {["media", "battery"].includes(item.widget) && <Toggle label={t("overhaul.relevant")} hint={t("overhaul.relevantHint")} checked={!!st.hideWhenUnavailable} onChange={(value) => set1({ hideWhenUnavailable: value })} />}
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
        <Row label={t("overhaul.widgetSize")}>
          <SegmentedControl value={String(st.span || "auto")} onChange={(v) => set1({ span: v === "auto" ? null : Number(v) })}
            options={[{ value: "auto", label: t("overhaul.automatic") }, ...[1, 2, 3].map((n) => ({ value: String(n), label: `${n}×` }))]} />
        </Row>
        <Row label={t("w.color")}>
          <AccentPicker value={st.color || accent} onChange={(v) => set1({ color: v })} />
        </Row>
        <Toggle label={t("w.animated")} checked={!!st.animated} onChange={(v) => set1({ animated: v })} />
        <Toggle label={t("w.showIcon")} checked={st.icon !== false} onChange={(v) => set1({ icon: v })} />
        </div>
  );
}

function Apps(props) {
  return props.section === "apps" ? <LibraryWorkspace {...props} listInstalled={installedAppsOnce} iconPicker={IconPickerModal} /> : props.section === "widgets" ? <WidgetsWorkspace {...props} styleFields={WidgetStyleFields} /> : null;
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
// The "everything general" tab: system toggles, language, shortcuts, updates
// and backup — anything that isn't about how the dock looks or moves.
function DiagnosticsCard() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setStatus("");
    try {
      const path = await pickSavePath("booki-diagnostics.json");
      if (path) { await dockApi.exportDiagnostics(path); setStatus(t("overhaul.exported")); }
    } catch (_) { setStatus(t("overhaul.failed")); }
    finally { setBusy(false); }
  };
  return <SettingsSection title={t("overhaul.diagnostics")} hint={t("overhaul.diagnosticsHint")}><div className="diagnostics-row"><button className="s-btn s-btn-soft" disabled={busy} onClick={save}>{t("overhaul.diagnostics")}</button><span role="status">{status}</span></div></SettingsSection>;
}

function General({ cfg, set, onWhatsNew, beforeApply }) {
  const [autostart, setAutostart] = useState(!!cfg.autostart);
  useEffect(() => {
    dockApi.getAutostart().then((v) => setAutostart(!!v));
  }, []);
  return (
    <>
      <PageHeader title={t("gen.title")}>{t("gen.hint")}</PageHeader>

      <SettingsSection>
        <Row label={t("ap.language")} hint={t("gen.langHint")}>
          <Dropdown
            selectedOptions={[cfg.language || "system"]}
            onOptionSelect={(_e, data) => set({ language: data.optionValue })}
          >
            {LANG_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value}>{o.key ? t(o.key) : o.label}</Option>
            ))}
          </Dropdown>
        </Row>
        <Toggle
          label={t("be.autostart")}
          checked={autostart}
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
          }}
        />
      </SettingsSection>

      <SettingsSection title={t("ab.updates")} hint={t("ab.updatesHint")}>
        <UpdatesCard onWhatsNew={onWhatsNew} beforeApply={beforeApply} />
      </SettingsSection>

      <DiagnosticsCard />
      <SettingsSection title={t("gen.more")}>
        <Toggle
          label={t("gen.captureVisible")}
          hint={t("gen.captureVisibleHint")}
          checked={!!cfg.captureVisible}
          onChange={(v) => set({ captureVisible: v })}
        />
        <Toggle
          label={t("gen.ctxMenu")}
          hint={t("gen.ctxMenuHint")}
          checked={cfg.contextMenu !== false}
          onChange={(v) => set({ contextMenu: v })}
        />
      </SettingsSection>
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
  const [searchTarget, setSearchTarget] = useState(null);
  const [focusedPin, setFocusedPin] = useState(null);
  const [tab, setTabRaw] = useState(() => {
    try {
      const saved = localStorage.getItem("booki.lastTab");
      return [...TAB_IDS, ...LEGACY_TABS].includes(saved) ? saved : "home";
    } catch (_) {
      return "home";
    }
  });
  const setTab = (t) => {
    setFocusedPin(null);
    setTabRaw(t);
    try { localStorage.setItem("booki.lastTab", t); } catch (_) {}
    requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0;
    });
  };
  const [version, setVersion] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [closeError, setCloseError] = useState(false);
  const [query, setQuery] = useState("");
  const searchResults = useMemo(() => findSettings(query), [query]);
  const [activeSearchResult, setActiveSearchResult] = useState(0);
  // One-time "start here" banner — persisted in config (not only localStorage),
  // so a WebView data wipe / reinstall with kept AppData still remembers it.
  const dismissIntro = () => {
    try { localStorage.setItem("booki.introSeen", "1"); } catch (_) {}
    set({ settingsIntroSeen: true });
  };
  const saveTimer = useRef(null);
  const cfgRef = useRef(null);
  const dirtyKeys = useRef(new Set());
  const dirtyBase = useRef(new Map());
  const [configConflict, setConfigConflict] = useState(null);
  const savingKeys = useRef(new Set());
  const closing = useRef(false);
  const afterSaveCb = useRef(null);
  cfgRef.current = cfg;

  // Merge only the keys Settings actually touched onto a fresh disk snapshot so
  // a debounced slider save cannot wipe pins the dock wrote a moment earlier.
  const saveQueue = useRef(Promise.resolve());
  const flushSave = () => {
    const queued = saveQueue.current.then(() => performSave());
    saveQueue.current = queued.catch(() => {});
    return queued;
  };
  const performSave = async () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const keys = [...dirtyKeys.current];
    const base = Object.fromEntries(keys.map((key) => [key, dirtyBase.current.get(key)]));
    for (const key of keys) dirtyBase.current.delete(key);
    dirtyKeys.current.clear();
    savingKeys.current = new Set(keys);
    const cb = afterSaveCb.current;
    afterSaveCb.current = null;
    if (!keys.length) return;
    const snap = cfgRef.current;
    if (!snap) return;
    setSaveState("saving");
    try {
      const patch = {};
      for (const key of keys) if (key in snap) patch[key] = snap[key];
      if (keys.includes("pinned")) patch.pinned = normalizePinned(snap.pinned || [], { keepEmpty: true });
      const toSave = await configApi.patch(patch, { base, expectedRevision: snap.revision }) || { ...snap, ...patch };
      await emitConfigChanged();
      if (!dirtyKeys.current.size) cfgRef.current = toSave;
      setCfg((prev) => {
        if (!prev) return toSave;
        // Keep any edits typed while the save was in flight.
        if (dirtyKeys.current.size) return prev;
        return { ...prev, ...toSave };
      });
      setSaveState("saved");
      setConfigConflict(null);
      if (typeof cb === "function") cb(toSave);
    } catch (error) {
      const conflict = parseConfigConflict(error);
      if (conflict) setConfigConflict(conflict);
      // Preserve the original baseline even if another edit arrived in flight.
      for (const k of keys) { dirtyKeys.current.add(k); dirtyBase.current.set(k, base[k]); }
      setSaveState("error");
    } finally {
      savingKeys.current.clear();
    }
  };

  useEffect(() => {
    let disposed = false;
    let unlisten;
    onCloseRequest((event) => {
      event.preventDefault();
      flushSave().then(() => {
        if (!dirtyKeys.current.size) finishClose();
      });
    }).then((un) => { if (disposed) un(); else unlisten = un; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

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
    const noDrag = (e) => { if (!e.target.closest('[draggable="true"]')) e.preventDefault(); };
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
    setSearchTarget(result);
  };

  useEffect(() => {
    if (!searchTarget) return;
    let frame, timer;
    frame = requestAnimationFrame(() => {
      let target = [...document.querySelectorAll("[data-setting-label]")].find((el) => el.dataset.settingLabel === searchTarget.label);
      // Reveal only the target's ancestors, preserving unrelated sections.
      for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
        if (parent.matches('details')) parent.open = true;
        if (parent.classList.contains('ui-collapsible')) parent.querySelector(':scope > .ui-group > .ui-disclosure[aria-expanded="false"]')?.click();
      }
      frame = requestAnimationFrame(() => {
        target = [...document.querySelectorAll("[data-setting-label]")].find((el) => el.dataset.settingLabel === searchTarget.label);
        if (!target) return;
        target.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        target.classList.add("setting-search-target");
        target.querySelector("input, select, button")?.focus({ preventScroll: true });
        timer = setTimeout(() => target.classList.remove("setting-search-target"), 2500);
      });
    });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [tab, searchTarget]);

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
    const prev = cfgRef.current;
    const next = { ...prev, ...patch };
    if (patch.pinned) next.pinned = normalizePinned(patch.pinned, { keepEmpty: true });
    // Record the draft synchronously: a native close can arrive before React
    // renders the edit, and must still wait for those keys to reach disk.
    for (const k of Object.keys(patch)) {
      if (!dirtyKeys.current.has(k)) dirtyBase.current.set(k, structuredClone(prev?.[k]));
      dirtyKeys.current.add(k);
    }
    cfgRef.current = next;
    setCfg(next);
    if (prev && prev.language !== next.language) {
      ensureLang(next.language).then(() => {
        setLang(next.language);
        setCfg((c) => ({ ...c }));
      });
    } else setLang(next.language);
    applyTheme(next);
    applySurfaceVars(next);
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    if (typeof opts.afterSave === "function") afterSaveCb.current = opts.afterSave;
    saveTimer.current = setTimeout(flushSave, opts.flush ? 0 : 120);
  };

  const finishClose = async () => {
    if (closing.current) return;
    closing.current = true;
    setCloseError(false);
    const keepAlive = ["downloading", "ready", "installing"].includes(updates.snapshot().phase);
    try { await closeSelf({ keepAlive }); }
    catch (_) { setCloseError(true); }
    finally { closing.current = false; }
  };

  const resolveConfigConflict = async (keepMine) => {
    if (!configConflict) return;
    clearTimeout(saveTimer.current);
    const next = { ...cfgRef.current };
    for (const key of configConflict.keys) {
      if (keepMine) dirtyBase.current.set(key, structuredClone(configConflict.current[key]));
      else {
        dirtyKeys.current.delete(key);
        dirtyBase.current.delete(key);
        next[key] = configConflict.current[key];
      }
    }
    next.revision = configConflict.current.revision;
    cfgRef.current = next;
    setCfg(next);
    applyTheme(next);
    applySurfaceVars(next);
    await ensureLang(next.language);
    setLang(next.language);
    setConfigConflict(null);
    setSaveState("idle");
    await flushSave();
  };

  const prepareConfigOperation = async () => { await flushSave(); if (dirtyKeys.current.size) throw new Error("pending settings could not be saved"); };
  const applySnapshot = async (operation) => {
    const recovery = await invoke('config_recovery_status');
    if (!recovery?.blocked) await prepareConfigOperation();
    const fresh = await operation();
    if (!fresh) throw new Error("profile unavailable");
    if (recovery?.blocked) { clearTimeout(saveTimer.current); dirtyKeys.current.clear(); dirtyBase.current.clear(); }
    await ensureLang(fresh.language);
    cfgRef.current = fresh; setCfg(fresh); applyTheme(fresh); applySurfaceVars(fresh);
    await emitConfigChanged();
    return fresh;
  };
  const applyProfile = (name) => applySnapshot(() => dockApi.profileApply(name));
  const importProfile = (path, expected) => applySnapshot(() => dockApi.importConfig(path, expected));

  const reset = async () => {
    await flushSave();
    if (dirtyKeys.current.size) return;
    try {
      const fresh = await configApi.reset();
      if (fresh) {
        await ensureLang(fresh.language);
        cfgRef.current = fresh;
        setCfg(fresh);
        applyTheme(fresh);
        applySurfaceVars(fresh);
        await emitConfigChanged();
      }
    } catch (_) { setSaveState("error"); }
  };

  useEffect(() => {
    const onKey = async (e) => {
      if (e.defaultPrevented || e.key !== "Escape") return;
      // Escape closes the changelog modal first, then the window.
      if (showChangelog) setShowChangelog(false);
      else { await flushSave(); if (!dirtyKeys.current.size) finishClose(); }
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
          const next = { ...c };
          for (const key of new Set([...savingKeys.current, ...dirtyKeys.current])) next[key] = prev[key];
          next.onboarded = prev.onboarded || c.onboarded;
          next.settingsIntroSeen = prev.settingsIntroSeen || c.settingsIntroSeen;
          next.seenVersion = c.seenVersion || prev.seenVersion;
          applyTheme(next);
          applySurfaceVars(next);
          ensureLang(next.language).then(() => setCfg((current) => ({ ...current })));
          cfgRef.current = next;
          return next;
        })
      );
    }).then((u) => (un = u));
    return () => un && un();
  }, []);

  if (!cfg) {
    return (
      <>
        <SettingsSkeleton />
      </>
    );
  }

  return (
    <>
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
          <nav className="s-nav">
            {TABS.map((entry, i) =>
              entry ? (
                <button
                  key={entry[0]}
                  className={"s-navitem" + ((NAV_PARENT[tab] || tab) === entry[0] ? " active" : "")}
                  aria-current={(NAV_PARENT[tab] || tab) === entry[0] ? "page" : undefined}
                  type="button"
                  onClick={() => setTab(entry[0])}
                >
                  <span className="s-navicon" style={{ background: entry[3] }} dangerouslySetInnerHTML={{ __html: icon(entry[2]) }} />
                  <span>{t(entry[1])}</span>
                </button>
              ) : (
                <span key={"gap" + i} className="s-nav-gap" aria-hidden="true" />
              )
            )}
          </nav>
          <div className="s-sidebar-foot">
            <button className="s-btn s-btn-ghost" onClick={async () => { await flushSave(); if (!dirtyKeys.current.size) dockApi.quit(); }}>{t("act.quit")}</button>
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
          {/* No key={tab} here: the panels below are already conditional, so
              switching tabs unmounts one and mounts the other on its own. The
              key additionally remounted this wrapper and the save-status line,
              which threw away the "saved" indicator mid-flight. */}
          <div>
            <div className={"s-save-status status-" + saveState} role="status" aria-live="polite">
              {saveState === "saving" ? t("status.saving") : saveState === "saved" ? t("status.saved") : saveState === "error" ? t("status.saveError") : ""}
            </div>
            {configConflict && <div className="settings-close-error" role="alert"><span>{t("workspace.conflict")}</span><button className="s-btn s-btn-soft" onClick={() => resolveConfigConflict(true)}>{t("workspace.keepMine")}</button><button className="s-btn s-btn-soft" onClick={() => resolveConfigConflict(false)}>{t("workspace.useOther")}</button></div>}
            {closeError && <div className="settings-close-error" role="alert"><span>{t("workspace.closeFailed")}</span><button className="s-btn s-btn-soft" onClick={async () => { await flushSave(); if (!dirtyKeys.current.size) finishClose(); }}>{t("focus.retry")}</button></div>}
            <NativeBackdrop cfg={cfg} />
            <RecoveryNotice revision={cfg.revision} onProfiles={() => setTab("profiles")} onStartFresh={() => applySnapshot(() => invoke("start_fresh_config"))} />
            <SettingsBoundary key={tab} onHome={() => setTab("home")}>
            {tab === "home" && <Dashboard cfg={cfg} set={set} navigate={setTab} version={version} onProfile={applyProfile} listProfiles={dockApi.profileList} onSelect={(item) => { setTab(item.kind === "widget" ? "widgets" : "apps"); setFocusedPin(item.id); }} />}
            {tab === "appearance" && <Appearance cfg={cfg} set={set} />}
            {tab === "dock" && <><DockPage cfg={cfg} set={set} /><AutoHidePage cfg={cfg} set={set} embedded /><NotchPage cfg={cfg} set={set} embedded /></>}
            {tab === "autohide" && <AutoHidePage cfg={cfg} set={set} />}
            {tab === "notch" && <NotchPage cfg={cfg} set={set} />}
            {tab === "apps" && <Apps cfg={cfg} set={set} section="apps" focusedPin={focusedPin} />}
            {tab === "widgets" && <Apps cfg={cfg} set={set} section="widgets" focusedPin={focusedPin} />}
            {tab === "clipboard" && <ClipboardPage cfg={cfg} set={set} />}
            {tab === "shortcuts" && <ShortcutsPage cfg={cfg} set={set} />}
            {tab === "profiles" && <ProfilesPage cfg={cfg} onApply={applyProfile} beforeSnapshot={prepareConfigOperation} onImport={importProfile} />}
            {tab === "general" && <><General cfg={cfg} set={set} beforeApply={prepareConfigOperation} onWhatsNew={() => setShowChangelog(true)} /><CollapsibleSection title={t("tab.shortcuts")} defaultOpen={false}><ShortcutsSection cfg={cfg} set={set} /></CollapsibleSection></>}
            {tab === "faq" && <Faq version={version || "..."} />}
            {tab === "about" && <About version={version || "..."} onWhatsNew={() => setShowChangelog(true)} onReset={reset} />}
            </SettingsBoundary>
          </div>
        </main>
        {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
      </div>
    </>
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

function HistoricalRelease({ entry }) {
  const [open, setOpen] = useState(false);
  return <details className="cl-history-entry" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><strong>v{entry.version}</strong><span>{entry.date}</span><span>{entry.headline}</span></summary>
    {open && entry.sections.map((section, index) => <section key={index}><h3 className="cl-section-title"><ChangelogIcon name={section.icon} />{section.title}</h3><ul>{section.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></section>)}
  </details>;
}

// "What's new" shown as a modal inside Settings (no fragile extra window).
function ChangelogModal({ onClose }) {
  useModalControls(onClose);
  // changelog-data.js is ~107KB of prose covering 97 releases, and this modal
  // initially renders only the current update. Importing it statically shipped the whole history in
  // the Settings bundle for every user, every launch; loading it when the modal
  // actually opens keeps it out of the critical path.
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    let alive = true;
    import("./changelog-data.js")
      .then((m) => alive && setEntries(m.CHANGELOG))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, []);
  const log = entries ? [currentRelease(), ...previousReleases(), ...entries] : [];
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
          {entries === null && <p className="cl-headline">{t("cl.title")}…</p>}
          {log.slice(0, 1).map((entry, idx) => (
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
          {log.length > 1 && <details className="cl-history"><summary>{t("overhaul.history")}</summary>
            {log.slice(1).map((entry) => <HistoricalRelease key={entry.version} entry={entry} />)}
          </details>}
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
settingsRoot.render(<SettingsBoundary><App /></SettingsBoundary>);
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.settingsRoot = settingsRoot;
  });
}

// Text fields retain editing commands; Booki surfaces use app actions.
document.addEventListener("contextmenu", (event) => { if (!isTextEditor(event.target)) showBookiMenu(event); });
