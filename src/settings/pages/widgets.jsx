/* Widget catalog and per-instance settings, separated into accessible steps. */
import React, { useRef, useState } from "react";
import { t } from "../../i18n.js";
import { icon } from "../../icons.js";
import { WIDGET_ORDER, WIDGET_META, WIDGET_GLYPHS, widgetDisplayName } from "../../widgets-meta.js";
import { WidgetContent, WidgetConnections } from "../widget-content.jsx";
import { pluginsForWidget, pinnedWidgetInstances } from "../../widget-integrations.js";
import { findPin, updatePin, removePin } from "../../pins.js";
import { widgetRefs } from "../pin-model.js";
import { WidgetPreview } from "../dock-preview.jsx";
import { AccentPicker } from "../controls.jsx";
import { BreadcrumbHeader, Icon, PageHeader, Row, SegmentedControl } from "../ui.jsx";

const name = (widget) => widgetDisplayName(widget, t);
const CATEGORIES = [["all", "design.allWidgets", "grid"], ["time", "widgets.time", "clock"], ["system", "overhaul.system", "cpu"], ["media", "w.media", "music"], ["tools", "design.utilityWidgets", "sliders"]];
const glyph = (widget) => ({ __html: icon(WIDGET_GLYPHS[widget] || "sparkles") });

/** Settings of one widget copy: a pivot of tabs, the live preview always in view. */
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
    }}>{steps.map((name, index) => <button type="button" role="tab" key={name} id={`${base}-${name}`} aria-controls={`${base}-panel`} aria-selected={step === index} tabIndex={step === index ? 0 : -1} onClick={() => selectStep(index)}>{t(`widgetFlow.${name}`)}</button>)}</div>
    <section id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${active}`} tabIndex={0} className="widget-settings-panel">
      {active === "content" && <WidgetContent item={item} cfg={cfg} set={set} patch={patch} />}
      {active === "connections" && <WidgetConnections widget={item.widget} />}
      {active === "appearance" && <>
        <Row label={t("w.variant")}><SegmentedControl value={["glass", "solid", "minimal"].includes(style.variant) ? style.variant : "glass"} onChange={(variant) => patch({ variant })} options={[{ value: "glass", label: t("w.v.glass") }, { value: "solid", label: t("w.v.solid") }, { value: "minimal", label: t("w.v.minimal") }]} /></Row>
        {item.widget !== "system" && <Row label={t("overhaul.widgetSize")} stack><SegmentedControl value={String(style.span || "auto")} onChange={(value) => patch({ span: value === "auto" ? null : Number(value) })} options={[{ value: "auto", label: t("overhaul.automatic") }, ...[1, 2, 3].map((n) => ({ value: String(n), label: t(`w.span${n}`) }))]} /></Row>}
        <Row label={t("w.color")} stack><AccentPicker sources value={style.color || WIDGET_META[item.widget]?.accent || cfg.accent} onChange={(color) => patch({ color })} /></Row>
      </>}
    </section>
  </div>;
}

/** A gallery card: what it looks like, what it does, and one clear action. */
function CatalogCard({ widget, count, selected, style, onInspect, onAdd }) {
  const meta = WIDGET_META[widget];
  const pinned = count > 0;
  return <article className="card catalog-card" data-widget={widget} data-selected={selected || undefined} style={{ "--widget-accent": meta.accent }}>
    <button type="button" className="catalog-open" aria-pressed={selected} aria-label={`${name(widget)}${pinned ? `, ${t("widget.pinned")}` : ""}`} onClick={onInspect}>
      <span className="catalog-preview" aria-hidden="true"><span className="catalog-stage"><WidgetPreview widget={widget} style={style} size={widget === "system" ? 30 : 40} /></span></span>
      <span className="catalog-head">
        <span className="catalog-icon" dangerouslySetInnerHTML={glyph(widget)} />
        <span className="catalog-text"><span className="catalog-name"><span className="catalog-title">{name(widget)}</span>{pinned && <span className="catalog-badge" title={count > 1 ? t("gallery.count").replace("{n}", () => count) : t("gallery.onDock")} dangerouslySetInnerHTML={{ __html: icon("check") + (count > 1 ? `<b>${count}</b>` : "") }} />}</span>
          <span className="catalog-desc">{t(meta.desc)}</span></span>
      </span>
    </button>
    <footer className="catalog-foot">
      {pinned
        ? <button type="button" className="button catalog-action" onClick={onInspect}><Icon name="settings" />{t("gallery.configure")}</button>
        : <button type="button" className="button catalog-action" aria-label={t("widgetFlow.addNamed").replace("{name}", () => name(widget))} onClick={onAdd}><Icon name="plus" />{t("widget.add")}</button>}
    </footer>
  </article>;
}

/** The widgets on the dock, as they look there, one click from their settings. */
function OnDock({ cfg, selectedId, onPick }) {
  const pins = WIDGET_ORDER.flatMap((widget) => pinnedWidgetInstances(cfg.pinned, widget));
  return <section className="widgets-on-dock" aria-labelledby="widgets-on-dock-title">
    <h2 id="widgets-on-dock-title">{t("gallery.onDock")} <span className="count">{pins.length}</span></h2>
    {pins.length ? <ul>{pins.map((pin) => <li key={pin.id}>
      <button type="button" data-pin-id={pin.id} className="widgets-on-dock-item" aria-pressed={selectedId === pin.id} style={{ "--widget-accent": WIDGET_META[pin.widget]?.accent }}
        aria-label={t("widgetFlow.configureNamed").replace("{name}", () => pin.style?.device || name(pin.widget))} onClick={(event) => onPick(pin.id, event.currentTarget)}>
        <span className="on-dock-preview" aria-hidden="true"><WidgetPreview widget={pin.widget} style={pin.style} size={32} /></span>
        <span className="on-dock-name"><span className="catalog-icon" dangerouslySetInnerHTML={glyph(pin.widget)} />{pin.style?.device || name(pin.widget)}</span>
        {pin.group && <span className="on-dock-group"><Icon name="folder" />{pin.group}</span>}
      </button>
    </li>)}</ul> : <p className="empty">{t("gallery.emptyDock")}</p>}
  </section>;
}

export function WidgetsPage({ cfg, set, focusedPin }) {
  const [selectedId, selectId] = useState(focusedPin || null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const origin = useRef(null);
  const saved = findPin(cfg.pinned, selectedId);
  const selected = saved?.kind === "widget" ? saved : draft;
  const fresh = (widget) => ({ id: crypto.randomUUID(), kind: "widget", widget, name: name(widget), path: "", args: [], style: {} });
  const deselect = () => { selectId(null); setDraft(null); };
  const inspect = (widget) => {
    // Clicking the widget already open closes its settings again.
    if (selected?.widget === widget) { deselect(); return; }
    origin.current = document.activeElement;
    const refs = widgetRefs(cfg.pinned, widget);
    const ref = refs.find((r) => r.id === selectedId) || refs[0];
    selectId(ref?.id || null);
    setDraft(ref ? null : fresh(widget));
  };
  const pick = (id, from) => { if (selectedId === id && saved) { deselect(); return; } origin.current = from; setDraft(null); selectId(id); };
  // One click adds it; its settings open beside the gallery to fine-tune.
  const add = (widget) => { const pin = fresh(widget); set({ pinned: [...cfg.pinned, pin] }); setDraft(null); selectId(pin.id); };
  const change = (style) => {
    if (saved) set({ pinned: updatePin(cfg.pinned, saved.id, { style }) });
    else setDraft((item) => ({ ...item, style }));
  };
  const fold = (value) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  const widgets = WIDGET_ORDER.filter((widget) => (category === "all" || WIDGET_META[widget].category === category)
    && words.every((word) => fold(`${name(widget)} ${t(WIDGET_META[widget].desc)}`).includes(word)));
  const instances = selected ? pinnedWidgetInstances(cfg.pinned, selected.widget) : [];
  // Windows Settings: a chosen widget opens as its own page, full width,
  // with "Widgets › name" to go back. Nothing is squeezed into a side column.
  // The gallery is drawn anew on return, so focus finds the widget again.
  const back = () => {
    const id = saved?.id, widget = selected?.widget;
    selectId(null); setDraft(null);
    requestAnimationFrame(() => (document.querySelector(`.widgets-on-dock-item[data-pin-id="${CSS.escape(id || '')}"]`)
      || document.querySelector(`.catalog-card[data-widget="${CSS.escape(widget || '')}"] .catalog-open`))?.focus());
  };
  if (selected) return <>
    <BreadcrumbHeader parent={t("tab.widgets")} title={saved?.style?.device || name(selected.widget)} onBack={back} />
    <div className="inspector widget-sheet widget-page" style={{ "--widget-accent": WIDGET_META[selected.widget]?.accent }}>
      <header className="widget-page-hero">
        <span className="widget-page-stage"><span className="catalog-stage"><WidgetPreview widget={selected.widget} style={selected.style || {}} size={56} /></span></span>
        <div className="widget-page-text">
          <h2><span className="catalog-icon" dangerouslySetInnerHTML={glyph(selected.widget)} />{name(selected.widget)}</h2>
          <p>{saved ? (saved.group ? t("gallery.inGroup").replace("{group}", () => saved.group) : t("gallery.onDock")) : t(WIDGET_META[selected.widget]?.desc || "widget.defaultDesc")}</p>
          {saved && instances.length > 1 && <label className="widget-page-instance"><span>{t("widgetFlow.instance")}</span><select className="text-field" aria-label={t("widgetFlow.instance")} value={saved.id} onChange={(event) => selectId(event.target.value)}>{instances.map((pin, index) => <option key={pin.id} value={pin.id}>{pin.style?.device || pin.name || name(pin.widget)} · {pin.group || t("tab.dock")} · {index + 1}</option>)}</select></label>}
        </div>
        <div className="widget-page-actions">
          {saved
            ? <button type="button" className="button button-danger-subtle" onClick={() => { set({ pinned: removePin(cfg.pinned, saved.id) }); back(); }}><Icon name="trash" />{t("apps.remove")}</button>
            : <button type="button" className="button button-accent" onClick={() => { set({ pinned: [...cfg.pinned, draft] }); selectId(draft.id); setDraft(null); }}><Icon name="plus" />{t("widget.add")}</button>}
        </div>
      </header>
      <WidgetFields key={`${selected.id}:${selected.widget}`} item={selected} cfg={cfg} set={set} onChange={change} />
    </div>
  </>;
  return <>
    <PageHeader title={t("tab.widgets")}>{t("apps.widgetsHint")}</PageHeader>
    <OnDock cfg={cfg} selectedId={saved?.id} onPick={pick} />
    <div className="widgets-split">
      <section className="widgets-explore" aria-labelledby="widgets-explore-title">
        <div className="widgets-explore-head">
          <h2 id="widgets-explore-title">{t("gallery.explore")}</h2>
          <label className="search-field"><Icon name="search" /><input type="search" aria-label={t("design.widgetsSearch")} placeholder={t("design.widgetsSearch")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); setQuery(""); } }} /></label>
        </div>
        <div className="widget-pivot" role="group" aria-label={t("tab.widgets")}>
          {CATEGORIES.map(([value, key, glyphName]) => <button key={value} type="button" className="pivot-item" aria-pressed={category === value} onClick={() => setCategory(value)}><Icon name={glyphName} />{t(key)}</button>)}
        </div>
        <div className="catalog-grid">
          {widgets.map((widget) => {
            const refs = widgetRefs(cfg.pinned, widget);
            return <CatalogCard key={widget} widget={widget} count={refs.length} selected={selected?.widget === widget}
              style={findPin(cfg.pinned, refs[0]?.id)?.style} onInspect={() => inspect(widget)} onAdd={() => add(widget)} />;
          })}
          {!widgets.length && <p className="empty" role="status">{t("add.none")}</p>}
        </div>
      </section>
    </div>
  </>;
}
