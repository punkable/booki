import React, { useRef, useState } from 'react';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { WIDGET_ORDER, WIDGET_META, WIDGET_GLYPHS, widgetDisplayName as widgetDisplayNameShared } from '../widgets-meta.js';
import { findPin, updatePin, removePin } from '../pins.js';
import { widgetRefs } from './pin-model.js';
import { Inspector } from './inspector.jsx';
import { PageHeader, Icon } from './ui.jsx';
import { WidgetPreview } from './dock-preview.jsx';
const widgetDisplayName = widget => widgetDisplayNameShared(widget, t);

function WidgetStoreCard({ widget, label, refs, previewStyle, onInspect, selected = false }) {
  const meta = WIDGET_META[widget] || { accent: "var(--accent)", desc: "widget.defaultDesc", caps: [] };
  return <article className={"widget-store-card" + (refs.length ? " pinned" : "") + (selected ? " selected" : "")} style={{ "--widget-accent": meta.accent }}>
    <button type="button" className="widget-store-choice" aria-label={`${t("next.inspector")}: ${label}`} aria-pressed={selected} onClick={onInspect}>
      <span className="widget-store-top"><span className="widget-store-ico" dangerouslySetInnerHTML={{ __html: icon(WIDGET_GLYPHS[widget] || "sparkles") }} /><span className="widget-store-body"><strong>{label}</strong><span className="widget-store-description">{t(meta.desc)}</span></span>
        {refs.length > 0 && <span className="widget-store-badge" title={t("widget.pinned")} aria-label={t("widget.pinned")}><Icon name="check" /></span>}
      </span>
      <span className="widget-store-preview"><WidgetPreview widget={widget} style={previewStyle} size={40} /></span>
      <span className="booki-sr-only">{(meta.caps || []).map(cap => t(cap)).join(" · ")}</span>
    </button>
  </article>;
}

export function WidgetsWorkspace({ cfg, set, focusedPin, styleFields: StyleFields }) {
  const [selectedId, selectId] = useState(focusedPin || null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const inspectorOrigin = useRef(null);
  const saved = findPin(cfg.pinned, selectedId);
  const selected = saved?.kind === "widget" ? saved : draft;
  const inspect = (widget) => {
    inspectorOrigin.current = document.activeElement;
    const ref = widgetRefs(cfg.pinned, widget)[0];
    selectId(ref?.id || null);
    setDraft(ref ? null : { id: crypto.randomUUID(), kind: "widget", widget, name: widgetDisplayName(widget), path: "", args: [], style: {} });
  };
  const change = (style) => {
    if (saved) set({ pinned: updatePin(cfg.pinned, saved.id, { style }) });
    else setDraft((item) => ({ ...item, style }));
  };
  const categories = { system: ["cpu","ram","disk","net","uptime","battery"], tools: ["clock","notes","clipboard","timer","tasks","calendar","weather"], media: ["media","volume"] };
  const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const widgets = WIDGET_ORDER.filter(widget => (category === "all" || categories[category]?.includes(widget)) && words.every(word => normalize(widgetDisplayName(widget) + " " + t(WIDGET_META[widget].desc)).includes(word)));
  return <>
    <PageHeader title={t("tab.widgets")}>{t("apps.widgetsHint")}</PageHeader>
    <div className="widget-gallery-tools"><label className="app-library-search"><Icon name="search" /><input type="search" aria-label={t("design.widgetsSearch")} placeholder={t("design.widgetsSearch")} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="app-library-filters" role="group" aria-label={t("workspace.sources")}>{[["all","design.allWidgets"],["system","overhaul.system"],["tools","design.utilityWidgets"],["media","w.media"]].map(([value,key]) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{t(key)}</button>)}</div>
    </div>
    <div className="widgets-workspace">
      <div className="widget-store-grid">{widgets.map(widget => <WidgetStoreCard key={widget} widget={widget} label={widgetDisplayName(widget)} refs={widgetRefs(cfg.pinned, widget)} previewStyle={findPin(cfg.pinned, widgetRefs(cfg.pinned, widget)[0]?.id)?.style} selected={selected?.widget === widget} onInspect={() => inspect(widget)} />)}{!widgets.length && <p className="muted" role="status">{t("add.none")}</p>}</div>
      <Inspector className="widget-inspector" selectionKey={selected?.id} origin={inspectorOrigin} onBack={() => { selectId(null); setDraft(null); }}>
        {selected ? <>
          <StyleFields item={selected} accent={cfg.accent} cfg={cfg} set={set} onChange={change} />
          {saved ? <button className="s-btn s-btn-soft" onClick={() => { set({ pinned: removePin(cfg.pinned, saved.id) }); selectId(null); }}>{t("apps.remove")}</button> : <button className="s-btn" onClick={() => { set({ pinned: [...cfg.pinned, draft] }); selectId(draft.id); setDraft(null); }}>{t("widget.add")}</button>}
        </> : <p className="muted">{t("apps.widgetsHint")}</p>}
      </Inspector>
    </div>
  </>;
}

