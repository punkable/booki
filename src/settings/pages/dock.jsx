/* Dock: how it behaves, where it lives, how it looks, how it reacts.
   One page, ordered by how often people change each thing. */
import React, { useEffect, useState } from "react";
import { dock as dockApi } from "../../api.js";
import { t } from "../../i18n.js";
import { resolveNotchMode } from "../../notch-mode.js";
import { resolveSurfaceStyle } from "../../surface.js";
import { DockPreview } from "../dock-preview.jsx";
import { FinishPicker } from "../finish-picker.jsx";
import { AccentPicker, MonitorPicker, PositionPicker, ScenarioPicker, TintPicker } from "../controls.jsx";
import { CollapsibleSection, PageHeader, Row, SegmentedControl, SettingsSection, Slider, Toggle } from "../ui.jsx";

const seconds = (ms) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : ms % 100 === 0 ? 1 : 2)} s`;

export function DockPage({ cfg, set }) {
  const [monitors, setMonitors] = useState([]);
  useEffect(() => { dockApi.listMonitors().then((m) => setMonitors(m || [])).catch(() => {}); }, []);
  // Placement changes move native windows once the value is on disk.
  const afterPlacement = { flush: true, afterSave: () => { dockApi.reposition(cfg.edge || "bottom").catch(() => {}); dockApi.notchPreview(); } };
  const afterSurface = { flush: true, afterSave: () => dockApi.notchPreview() };
  const hides = (cfg.autoHideMode || "smart") !== "off";
  const glass = resolveSurfaceStyle(cfg) === "glass" && !cfg.reduceTransparency;

  return <>
    <PageHeader title={t("tab.dock")}>{t("dock.pageHint")}</PageHeader>
    <div className="sticky-preview"><DockPreview cfg={cfg} /></div>

    <SettingsSection title={t("dock.behavior")}>
      <div className="row-block"><ScenarioPicker cfg={cfg} set={set} /></div>
      {hides && <Row label={t("be.reveal")} hint={t("be.revealHint")}>
        <SegmentedControl value={cfg.notchTrigger || "click"} onChange={(v) => set({ notchTrigger: v })}
          options={[{ value: "click", label: t("be.revealClick") }, { value: "hover", label: t("be.revealHover") }]} />
      </Row>}
      {hides && <Row label={t("be.notchMode")} hint={resolveNotchMode(cfg) === "floating" ? t("be.notchModeFloatingHint") : t("be.notchModeAttachedHint")}>
        <SegmentedControl value={resolveNotchMode(cfg)} onChange={(v) => set({ notchMode: v }, afterPlacement)}
          options={[{ value: "attached", label: t("be.notchModeAttached") }, { value: "floating", label: t("be.notchModeFloating") }]} />
      </Row>}
      {hides && <Row label={t("be.hideDelay")} hint={t("be.hideDelayHint")}>
        <Slider value={cfg.autoHideDelay ?? 650} min={0} max={2500} step={50} fmt={seconds} onChange={(v) => set({ autoHideDelay: v })} />
      </Row>}
      <Toggle label={t("be.hideInFullscreen")} hint={t("be.hideInFullscreenHint")} checked={cfg.hideInFullscreen !== false} onChange={(v) => set({ hideInFullscreen: v })} />
    </SettingsSection>

    <SettingsSection title={t("be.position")}>
      <div className="row-block"><PositionPicker cfg={cfg} set={set} afterPlacement={afterPlacement} /></div>
      {monitors.length > 1 && <Row label={t("be.monitor")}>
        <MonitorPicker value={cfg.monitor ?? -1} monitors={monitors}
          onChange={(v) => set({ monitor: v, monitorName: v < 0 ? "" : monitors.find((m) => m.index === v)?.name || "" }, afterPlacement)} />
      </Row>}
      <Row label={t("be.edgeGap")} hint={t("be.edgeGapHint")}>
        <Slider value={cfg.edgeGap ?? 12} min={0} max={72} step={2} fmt={(v) => (v === 0 ? t("be.edgeGapFlush") : `${v}px`)} onChange={(v) => set({ edgeGap: v }, afterPlacement)} />
      </Row>
    </SettingsSection>

    <SettingsSection title={t("tab.appearance")}>
      <Row label={t("ap.theme")}>
        <SegmentedControl value={cfg.theme || "system"} onChange={(v) => set({ theme: v })}
          options={["system", "light", "dark", "auto"].map((value) => ({ value, label: t(`theme.${value}`) }))} />
      </Row>
      <Row label={t("ap.accent")} hint={t("ap.accentHint")} stack><AccentPicker value={cfg.accent} onChange={(v) => set({ accent: v })} /></Row>
      <div className="row-block"><FinishPicker cfg={cfg} set={(patch) => set(patch, afterSurface)} /></div>
      {glass && <Row label={t("dock.intensity")} hint={t("dock.intensityHint")}>
        <Slider value={cfg.materialStrength ?? 60} min={0} max={100} step={1} fmt={(v) => `${v}%`} onChange={(v) => set({ materialStrength: v }, afterSurface)} />
      </Row>}
      {glass && <Row label={t("ap.surfaceTint")} hint={t("ap.surfaceTintHint")} stack><TintPicker value={cfg.surfaceTint || ""} onChange={(v) => set({ surfaceTint: v }, afterSurface)} /></Row>}
      <Toggle label={t("overhaul.reduceTransparency")} hint={t("overhaul.reduceTransparencyHint")} checked={!!cfg.reduceTransparency} onChange={(v) => set({ reduceTransparency: v }, afterSurface)} />
    </SettingsSection>

    <SettingsSection title={t("gp.size")}>
      <Row label={t("ap.iconSize")}><Slider value={cfg.iconSize ?? 48} min={28} max={80} step={4} fmt={(v) => `${v}px`} onChange={(v) => set({ iconSize: v })} /></Row>
      <Row label={t("ap.spacing")}><Slider value={cfg.spacing ?? 6} min={0} max={20} step={1} fmt={(v) => `${v}px`} onChange={(v) => set({ spacing: v })} /></Row>
      <Row label={t("ap.radius")} hint={t("ap.radiusHint")}><Slider value={cfg.cornerRadius ?? 12} min={0} max={24} step={1} fmt={(v) => `${v}px`} onChange={(v) => set({ cornerRadius: v })} /></Row>
      <Toggle label={t("ap.compact")} hint={t("ap.compactHint")} checked={!!cfg.compact} onChange={(v) => set({ compact: v })} />
    </SettingsSection>

    <CollapsibleSection title={t("gp.interaction")} hint={t("dock.interactionHint")}>
      <Toggle label={t("be.magnify")} checked={cfg.magnification !== false} onChange={(v) => set({ magnification: v })} />
      {cfg.magnification !== false && <>
        <Row label={t("be.zoom")} hint={t("be.zoomHint")}>
          <Slider value={Math.min(150, Math.max(110, Math.round((cfg.zoom || 1.25) * 100)))} min={110} max={150} step={5} fmt={(v) => `${v}%`} onChange={(v) => set({ zoom: v / 100 })} />
        </Row>
        <Row label={t("be.anim")}>
          <SegmentedControl value={cfg.magnifyStyle || "spring"} onChange={(v) => set({ magnifyStyle: v })}
            options={[{ value: "spring", label: t("anim.springShort") }, { value: "smooth", label: t("anim.smoothShort") }, { value: "off", label: t("anim.offShort") }]} />
        </Row>
      </>}
      <Row label={t("overhaul.overflow")}>
        <SegmentedControl value={cfg.overflowMode || "adapt"} onChange={(v) => set({ overflowMode: v })}
          options={[{ value: "adapt", label: t("overhaul.adapt") }, { value: "scroll", label: t("overhaul.scroll") }]} />
      </Row>
      <Toggle label={t("be.showLabels")} checked={cfg.showLabels !== false} onChange={(v) => set({ showLabels: v })} />
      <Toggle label={t("be.showIndicators")} checked={cfg.showIndicators !== false} onChange={(v) => set({ showIndicators: v })} />
      <Toggle label={t("be.focusRunning")} hint={t("be.focusRunningHint")} checked={!!cfg.focusIfRunning} onChange={(v) => set({ focusIfRunning: v })} />
      <Toggle label={t("be.alwaysOnTop")} hint={t("be.alwaysOnTopHint")} checked={cfg.alwaysOnTop !== false}
        onChange={(v) => { set({ alwaysOnTop: v }); dockApi.setAlwaysOnTop(v); }} />
      <Toggle label={t("be.taskbarFollow")} hint={t("be.taskbarFollowHint")} checked={cfg.taskbarFollow !== false} onChange={(v) => set({ taskbarFollow: v })} />
      {cfg.taskbarFollow !== false && <>
        <Row label={t("be.taskbarSettle")} hint={t("be.taskbarSettleHint")}>
          <Slider value={cfg.taskbarSettleMs ?? 1000} min={0} max={3000} step={100} fmt={(v) => (v === 0 ? t("be.taskbarSettleOff") : seconds(v))} onChange={(v) => set({ taskbarSettleMs: v })} />
        </Row>
        <Toggle label={t("be.taskbarHoldHover")} hint={t("be.taskbarHoldHoverHint")} checked={cfg.taskbarHoldWhileHover !== false} onChange={(v) => set({ taskbarHoldWhileHover: v })} />
      </>}
      {resolveSurfaceStyle(cfg) === "glass" && !cfg.reduceTransparency && <Toggle label={t("ap.nativeMaterial")} hint={t("ap.nativeMaterialHint")}
        checked={cfg.nativeMaterial !== false} onChange={(v) => set({ nativeMaterial: v }, afterSurface)} />}
    </CollapsibleSection>
  </>;
}
