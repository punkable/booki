import React, { useRef, useState } from 'react';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { WIDGET_ORDER, WIDGET_META, WIDGET_GLYPHS, widgetDisplayName as widgetDisplayNameShared } from '../widgets-meta.js';
import { findPin, updatePin, removePin } from '../pins.js';
import { widgetRefs } from './pin-model.js';
import { Inspector } from './inspector.jsx';
import { PageHeader } from './ui.jsx';
import { WidgetPreview } from './dock-preview.jsx';
const widgetDisplayName = widget => widgetDisplayNameShared(widget, t);

function WidgetStoreCard({ widget, label, refs, onAdd, onEdit, inspect = false, selected = false }) {
  const meta = WIDGET_META[widget] || { emoji: "puzzle", accent: "var(--accent)", desc: "widget.defaultDesc", caps: [] };
  const pinned = refs.length > 0;
  return (
    <article className={"widget-store-card" + (pinned ? " pinned" : "")} style={{ "--widget-accent": meta.accent }}>
      <div className="widget-store-top">
        <span className="widget-store-ico" dangerouslySetInnerHTML={{ __html: icon(WIDGET_GLYPHS[widget] || "sparkles") }} />
        <div className="widget-store-body">
          <strong>{label}</strong>
          <p>{t(meta.desc)}</p>
        </div>
        {pinned && <span className="widget-store-badge">{t("widget.pinned")}</span>}
      </div>
      <div className="widget-store-preview"><WidgetPreview widget={widget} /></div>
      <div className="widget-store-caps">
        {(meta.caps || []).map((cap) => <span key={cap}>{t(cap)}</span>)}
      </div>
      <button
        type="button"
        className={"s-btn widget-store-btn" + (pinned || inspect ? " s-btn-soft" : "")}
        aria-label={inspect ? `${t("next.inspector")}: ${label}` : undefined}
        aria-pressed={inspect ? selected : undefined}
        onClick={pinned ? onEdit : onAdd}
      >
        <span className="s-btn-glyph" dangerouslySetInnerHTML={{ __html: icon(pinned || inspect ? "sliders" : "plus") }} />
        <span>{inspect || pinned ? t("widget.edit") : t("widget.add")}</span>
      </button>
    </article>
  );
}

export function WidgetsWorkspace({ cfg, set, focusedPin, styleFields: StyleFields }) {
  const [selectedId, selectId] = useState(focusedPin || null);
  const [draft, setDraft] = useState(null);
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
  return <>
    <PageHeader title={t("tab.widgets")}>{t("apps.widgetsHint")}</PageHeader>
    <div className="widgets-workspace">
      <div className="widget-store-grid">{WIDGET_ORDER.map((widget) => <WidgetStoreCard key={widget} widget={widget} label={widgetDisplayName(widget)} refs={widgetRefs(cfg.pinned, widget)} inspect selected={selected?.widget === widget} onAdd={() => inspect(widget)} onEdit={() => inspect(widget)} />)}</div>
      <Inspector className="widget-inspector" selectionKey={selected?.id} origin={inspectorOrigin} onBack={() => { selectId(null); setDraft(null); }}>
        {selected ? <>
          <StyleFields item={selected} accent={cfg.accent} cfg={cfg} set={set} onChange={change} />
          {saved ? <button className="s-btn s-btn-soft" onClick={() => { set({ pinned: removePin(cfg.pinned, saved.id) }); selectId(null); }}>{t("apps.remove")}</button> : <button className="s-btn" onClick={() => { set({ pinned: [...cfg.pinned, draft] }); selectId(draft.id); setDraft(null); }}>{t("widget.add")}</button>}
        </> : <p className="muted">{t("apps.widgetsHint")}</p>}
      </Inspector>
    </div>
  </>;
}

