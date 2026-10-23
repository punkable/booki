/* Widget catalog and per-instance settings, separated into accessible steps. */
import React, { useRef, useState } from "react";
import { t } from "../../i18n.js";
import { icon } from "../../icons.js";
import { WIDGET_ORDER, WIDGET_META, WIDGET_GLYPHS, widgetDisplayName } from "../../widgets-meta.js";
import { WidgetContent, WidgetConnections } from "../widget-content.jsx";
import { pluginsForWidget, pinnedWidgetInstances } from "../../widget-integrations.js";
import { findPin, updatePin, removePin } from "../../pins.js";
import { widgetRefs } from "../pin-model.js";
import { Inspector } from "../inspector.jsx";
import { WidgetPreview } from "../dock-preview.jsx";
import { AccentPicker } from "../controls.jsx";
import { Icon, PageHeader, Row, SegmentedControl } from "../ui.jsx";

const name = (widget) => widgetDisplayName(widget, t);
const CATEGORIES = [["all", "design.allWidgets"], ["time", "widgets.time"], ["system", "overhaul.system"], ["media", "w.media"], ["tools", "design.utilityWidgets"]];

/** Each instance has a small settings workspace, one step at a time. */
function WidgetFields({ item, cfg, set, onChange }) {
  const [step, setStep] = useState(0);
  const style = item.style || {};
  const patch = (next) => onChange({ ...style, ...next });
  const steps = ["content", "appearance", ...(pluginsForWidget(item.widget).length ? ["connections"] : [])];
  const active = steps[step];
  const base = `widget-step-${item.id}`;
  const selectStep = (index, focus = false) => { setStep(index); if (focus) document.getElementById(`${base}-${steps[index]}`)?.focus(); };
  return <div className="widget-settings-workspace">
    <div role="tablist" aria-label={t("widgetFlow.steps")} className="widget-settings-tabs" onKeyDown={(event) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      selectStep(event.key === "Home" ? 0 : event.key === "End" ? steps.length - 1 : (step + (event.key === "ArrowRight" ? 1 : steps.length - 1)) % steps.length, true);
    }}>{steps.map((name, index) => <button type="button" role="tab" aria-label={`${index + 1} ${t(`widgetFlow.${name}`)}`} key={name} id={`${base}-${name}`} aria-controls={`${base}-panel`} aria-selected={step === index} tabIndex={step === index ? 0 : -1} onClick={() => selectStep(index)}><span>{index + 1}</span>{t(`widgetFlow.${name}`)}</button>)}</div>
    <section id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${active}`} tabIndex={0} className="widget-settings-panel">
      {active === "content" && <WidgetContent item={item} cfg={cfg} set={set} patch={patch} />}
      {active === "connections" && <WidgetConnections widget={item.widget} />}
      {active === "appearance" && <>
        <div className="inspector-preview"><WidgetPreview widget={item.widget} style={style} size={52} /></div>
        <Row label={t("w.variant")}><SegmentedControl value={["glass", "solid", "minimal"].includes(style.variant) ? style.variant : "glass"} onChange={(variant) => patch({ variant })} options={[{ value: "glass", label: t("w.v.glass") }, { value: "solid", label: t("w.v.solid") }, { value: "minimal", label: t("w.v.minimal") }]} /></Row>
        {item.widget !== "system" && <Row label={t("overhaul.widgetSize")}><SegmentedControl value={String(style.span || "auto")} onChange={(value) => patch({ span: value === "auto" ? null : Number(value) })} options={[{ value: "auto", label: t("overhaul.automatic") }, ...[1, 2, 3].map((n) => ({ value: String(n), label: t(`w.span${n}`) }))]} /></Row>}
        <Row label={t("w.color")} stack><AccentPicker sources value={style.color || WIDGET_META[item.widget]?.accent || cfg.accent} onChange={(color) => patch({ color })} /></Row>
      </>}
    </section>
    <nav className="widget-settings-paging" aria-label={t("widgetFlow.steps")}><button type="button" className="button" disabled={step === 0} onClick={() => selectStep(step - 1, true)}>{t("stack.previous")}</button><span aria-live="polite">{step + 1} / {steps.length}</span><button type="button" className="button" disabled={step === steps.length - 1} onClick={() => selectStep(step + 1, true)}>{t("widgetFlow.next")}</button></nav>
  </div>;
}

function CatalogCard({ widget, pinned, selected, style, onInspect }) {
  const meta = WIDGET_META[widget];
  return <button type="button" className="card catalog-card" aria-pressed={selected} aria-label={`${name(widget)}${pinned ? `, ${t("widget.pinned")}` : ""}`} title={pinned ? t("widget.pinned") : undefined}
    style={{ "--widget-accent": meta.accent }} onClick={onInspect}>
    <span className="catalog-preview" aria-hidden="true"><WidgetPreview widget={widget} style={style} size={widget === "system" ? 30 : 40} /></span>
    <span className="catalog-head">
      <span className="catalog-icon" dangerouslySetInnerHTML={{ __html: icon(WIDGET_GLYPHS[widget] || "sparkles") }} />
      <span className="catalog-text">
        <span className="catalog-name"><span className="catalog-title">{name(widget)}</span>
          {pinned && <span className="catalog-pinned" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon("check") }} />}</span>
        <span className="catalog-desc">{t(meta.desc)}</span>
      </span>
    </span>
  </button>;
}

/** With nothing selected, the inspector lists the widgets already on the
   dock, so their settings are one click away. */
function InDock({ cfg, onInspect }) {
  const onDock = WIDGET_ORDER.filter((widget) => widgetRefs(cfg.pinned, widget).length > 0);
  return <div className="widgets-in-dock">
    <h2>{t("apps.inDock")}</h2>
    {onDock.length ? <ul>
      {onDock.map((widget) => <li key={widget}>
        <button type="button" className="widgets-in-dock-item" style={{ "--widget-accent": WIDGET_META[widget].accent }} onClick={(event) => onInspect(widget, event.currentTarget)}>
          <span className="catalog-icon" dangerouslySetInnerHTML={{ __html: icon(WIDGET_GLYPHS[widget] || "sparkles") }} />
          <span>{name(widget)}</span>
          <Icon name="chevron-right" />
        </button>
      </li>)}
    </ul> : null}
    <p className="empty">{t("widgets.pick")}</p>
  </div>;
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
    // Preserve the selected copy; the instance selector explicitly changes it.
    const refs = widgetRefs(cfg.pinned, widget);
    const ref = refs.find((r) => r.id === selectedId) || refs[0];
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
      <label className="search-field"><Icon name="search" /><input type="search" aria-label={t("design.widgetsSearch")} placeholder={t("design.widgetsSearch")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); setQuery(""); } }} /></label>
      <div className="chips" role="group" aria-label={t("tab.widgets")}>
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
          {saved && pinnedWidgetInstances(cfg.pinned, selected.widget).length > 1 && <Row label={t("widgetFlow.instance")}><select className="text-field" aria-label={t("widgetFlow.instance")} value={saved.id} onChange={(event) => selectId(event.target.value)}>{pinnedWidgetInstances(cfg.pinned, selected.widget).map((pin, index) => <option key={pin.id} value={pin.id}>{pin.style?.device || pin.name || name(pin.widget)} · {pin.group || t("tab.dock")} · {index + 1}</option>)}</select></Row>}
          <WidgetFields key={`${selected.id}:${selected.widget}`} item={selected} cfg={cfg} set={set} onChange={change} />
          <div className="inspector-actions">
            {saved
              ? <button type="button" className="button" onClick={() => { set({ pinned: removePin(cfg.pinned, saved.id) }); selectId(null); if (origin.current?.isConnected) origin.current.focus(); }}>{t("apps.remove")}</button>
              : <button type="button" className="button button-accent" onClick={() => { set({ pinned: [...cfg.pinned, draft] }); selectId(draft.id); setDraft(null); }}>{t("widget.add")}</button>}
          </div>
        </> : <InDock cfg={cfg} onInspect={inspect} />}
      </Inspector>
    </div>
  </>;
}
