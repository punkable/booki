/* Widgets: the catalog of ten, and an inspector for the one you pick. */
import React, { useEffect, useRef, useState } from "react";
import { dock as dockApi } from "../../api.js";
import { t } from "../../i18n.js";
import { icon } from "../../icons.js";
import { WIDGET_ORDER, WIDGET_META, WIDGET_GLYPHS, SYSTEM_METRICS, systemMetrics, metricLabel, widgetDisplayName } from "../../widgets-meta.js";
import { findPin, updatePin, removePin } from "../../pins.js";
import { widgetRefs } from "../pin-model.js";
import { Inspector } from "../inspector.jsx";
import { WidgetPreview } from "../dock-preview.jsx";
import { AccentPicker } from "../controls.jsx";
import { CollapsibleSection, Icon, PageHeader, Row, SegmentedControl, Slider, Toggle } from "../ui.jsx";

const name = (widget) => widgetDisplayName(widget, t);
const CATEGORIES = [["all", "design.allWidgets"], ["time", "widgets.time"], ["system", "overhaul.system"], ["media", "w.media"], ["tools", "design.utilityWidgets"]];

/** Clipboard history policy. Lives with the clipboard widget. */
function ClipboardPolicy({ cfg, set }) {
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => dockApi.clipboardStorageFailed().then((failed) => { if (active) setStorageFailed(!!failed); }).catch(() => {});
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [cfg.clipboardPersist]);
  return <>
    {storageFailed && <p className="notice notice-error" role="alert">{t("clip.storageFailed")}</p>}
    <p className="inline-note"><Icon name="shield" />{t("clip.privacyBody")}</p>
    <Toggle label={t("clip.memory")} hint={t("clip.memoryHint")} checked={!!cfg.clipboardPersist} onChange={(v) => set({ clipboardPersist: v })} />
    <Toggle label={t("clip.sensitive")} hint={t("clip.sensitiveHint")} checked={cfg.clipboardSensitiveGuard !== false} onChange={(v) => set({ clipboardSensitiveGuard: v })} />
    <Toggle label={t("clip.compact")} hint={t("clip.compactHint")} checked={!!cfg.clipboardCompact} onChange={(v) => set({ clipboardCompact: v })} />
    <Row label={t("clip.retention")} hint={t("clip.retentionHint")}>
      <Slider value={cfg.clipboardRetentionDays ?? 7} min={1} max={90} step={1} fmt={(v) => t("clip.days").replace("{n}", v)} onChange={(v) => set({ clipboardRetentionDays: v })} />
    </Row>
    <Row label={t("clip.limit")} hint={t("clip.limitHint")}>
      <Slider value={cfg.clipboardHistoryLimit ?? 60} min={10} max={200} step={10} fmt={(v) => t("clip.items").replace("{n}", v)} onChange={(v) => set({ clipboardHistoryLimit: v })} />
    </Row>
    <Row label={t("clip.clear")}><button type="button" className="button" onClick={() => dockApi.clipboardClear()}>{t("clip.clear")}</button></Row>
  </>;
}

/** What one widget shows and how it looks. */
function WidgetFields({ item, cfg, set, onChange }) {
  const style = item.style || {};
  const patch = (next) => onChange({ ...style, ...next });
  const metrics = systemMetrics(style);
  const toggleMetric = (metric) => {
    const next = metrics.includes(metric) ? metrics.filter((m) => m !== metric) : [...metrics, metric];
    if (next.length) patch({ metrics: SYSTEM_METRICS.filter((m) => next.includes(m)) });
  };
  return <>
    <div className="inspector-preview"><WidgetPreview widget={item.widget} style={style} size={52} /></div>
    {item.widget === "system" && <Row label={t("widgets.metrics")} hint={t("widgets.metricsHint")} stack>
      <div className="chips" role="group" aria-label={t("widgets.metrics")}>
        {SYSTEM_METRICS.map((metric) => <button key={metric} type="button" className="chip" aria-pressed={metrics.includes(metric)}
          disabled={metrics.length === 1 && metrics.includes(metric)} onClick={() => toggleMetric(metric)}>{metricLabel(metric, t)}</button>)}
      </div>
    </Row>}
    {item.widget === "notes" && <Row label={t("w.note")} stack>
      <input className="text-field" type="text" value={style.note || ""} placeholder={t("w.notesEmpty")} onChange={(e) => patch({ note: e.target.value })} />
    </Row>}
    {item.widget === "media" && <Toggle label={t("w.mediaScrollVolume")} hint={t("w.mediaScrollVolumeHint")} checked={!!style.scrollVolume} onChange={(v) => patch({ scrollVolume: v })} />}
    {["media", "battery"].includes(item.widget) && <Toggle label={t("overhaul.relevant")} hint={t("overhaul.relevantHint")} checked={!!style.hideWhenUnavailable} onChange={(v) => patch({ hideWhenUnavailable: v })} />}
    {["focus", "calendar", "weather", "clock"].includes(item.widget) && <p className="inline-note"><Icon name="info" />{t("widgets.openFromDock")}</p>}
    <Row label={t("w.variant")}>
      <SegmentedControl value={["glass", "solid", "minimal"].includes(style.variant) ? style.variant : "glass"} onChange={(v) => patch({ variant: v })}
        options={[{ value: "glass", label: t("w.v.glass") }, { value: "solid", label: t("w.v.solid") }, { value: "minimal", label: t("w.v.minimal") }]} />
    </Row>
    {item.widget !== "system" && <Row label={t("overhaul.widgetSize")}>
      <SegmentedControl value={String(style.span || "auto")} onChange={(v) => patch({ span: v === "auto" ? null : Number(v) })}
        options={[{ value: "auto", label: t("overhaul.automatic") }, ...[1, 2, 3].map((n) => ({ value: String(n), label: `${n}×` }))]} />
    </Row>}
    <Row label={t("w.color")} stack><AccentPicker value={style.color || WIDGET_META[item.widget]?.accent || cfg.accent} onChange={(v) => patch({ color: v })} /></Row>
    {item.widget === "clipboard" && <CollapsibleSection title={t("clip.privacyTitle")}><ClipboardPolicy cfg={cfg} set={set} /></CollapsibleSection>}
  </>;
}

function CatalogCard({ widget, pinned, selected, style, onInspect }) {
  const meta = WIDGET_META[widget];
  return <button type="button" className="card catalog-card" aria-pressed={selected} aria-label={`${t("next.inspector")}: ${name(widget)}`} title={pinned ? t("widget.pinned") : undefined}
    style={{ "--widget-accent": meta.accent }} onClick={onInspect}>
    <span className="catalog-head">
      <span className="catalog-icon" dangerouslySetInnerHTML={{ __html: icon(WIDGET_GLYPHS[widget] || "sparkles") }} />
      <span className="catalog-text"><span className="catalog-name">{name(widget)}</span><span className="catalog-desc">{t(meta.desc)}</span></span>
      {pinned && <Icon name="check" className="catalog-pinned" />}
    </span>
    <span className="catalog-preview" aria-hidden="true"><WidgetPreview widget={widget} style={style} size={widget === "system" ? 30 : 40} /></span>
  </button>;
}

export function WidgetsPage({ cfg, set, focusedPin }) {
  const [selectedId, selectId] = useState(focusedPin || null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const origin = useRef(null);
  const saved = findPin(cfg.pinned, selectedId);
  const selected = saved?.kind === "widget" ? saved : draft;
  const inspect = (widget) => {
    origin.current = document.activeElement;
    const ref = widgetRefs(cfg.pinned, widget)[0];
    selectId(ref?.id || null);
    setDraft(ref ? null : { id: crypto.randomUUID(), kind: "widget", widget, name: name(widget), path: "", args: [], style: {} });
  };
  const change = (style) => {
    if (saved) set({ pinned: updatePin(cfg.pinned, saved.id, { style }) });
    else setDraft((item) => ({ ...item, style }));
  };
  const fold = (value) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  const widgets = WIDGET_ORDER.filter((widget) => (category === "all" || WIDGET_META[widget].category === category)
    && words.every((word) => fold(`${name(widget)} ${t(WIDGET_META[widget].desc)}`).includes(word)));
  return <>
    <PageHeader title={t("tab.widgets")}>{t("apps.widgetsHint")}</PageHeader>
    <div className="toolbar">
      <label className="search-field"><Icon name="search" /><input type="search" aria-label={t("design.widgetsSearch")} placeholder={t("design.widgetsSearch")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className="chips" role="group" aria-label={t("workspace.sources")}>
        {CATEGORIES.map(([value, key]) => <button key={value} type="button" className="chip" aria-pressed={category === value} onClick={() => setCategory(value)}>{t(key)}</button>)}
      </div>
    </div>
    <div className="split">
      <div className="catalog-grid">
        {widgets.map((widget) => {
          const refs = widgetRefs(cfg.pinned, widget);
          return <CatalogCard key={widget} widget={widget} pinned={refs.length > 0} selected={selected?.widget === widget}
            style={findPin(cfg.pinned, refs[0]?.id)?.style} onInspect={() => inspect(widget)} />;
        })}
        {!widgets.length && <p className="empty" role="status">{t("add.none")}</p>}
      </div>
      <Inspector className="inspector" selectionKey={selected?.id} origin={origin} onBack={() => { selectId(null); setDraft(null); }}>
        {selected ? <>
          <header className="inspector-head" style={{ "--widget-accent": WIDGET_META[selected.widget]?.accent }}>
            <span className="catalog-icon" dangerouslySetInnerHTML={{ __html: icon(WIDGET_GLYPHS[selected.widget] || "sparkles") }} />
            <div><h2>{name(selected.widget)}</h2><p>{t(WIDGET_META[selected.widget]?.desc || "widget.defaultDesc")}</p></div>
          </header>
          <WidgetFields item={selected} cfg={cfg} set={set} onChange={change} />
          <div className="inspector-actions">
            {saved
              ? <button type="button" className="button" onClick={() => { set({ pinned: removePin(cfg.pinned, saved.id) }); selectId(null); }}>{t("apps.remove")}</button>
              : <button type="button" className="button button-accent" onClick={() => { set({ pinned: [...cfg.pinned, draft] }); selectId(draft.id); setDraft(null); }}>{t("widget.add")}</button>}
          </div>
        </> : <p className="empty">{t("widgets.pick")}</p>}
      </Inspector>
    </div>
  </>;
}
