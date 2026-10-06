import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { widgetCardHTML, setText, setMetric, clockParts, sparkPaths } from "../dock/widget-view.js";
import { widgetWidth } from "../dock/layout-model.js";
import { WIDGET_META, RING_WIDGETS, PREVIEW_WIDGETS, widgetDisplayName } from "../widgets-meta.js";
import { t, curLang } from "../i18n.js";
import { dock } from "../api.js";
import { isLibIcon, resolveLibIcon } from "../icon-library.js";
import { icon } from "../icons.js";
import { resolveSurfaceStyle, glassFillColor, surfaceAlpha, dockRadius, surfaceForeground, transparencyReduced } from "../surface.js";

/* The real widget markup/styles, with safe example data. Private notes and
   clipboard contents never appear in a preview or diagnostic screenshot. */
export function WidgetPreview({ widget, style: rawStyle, size = 48, gap = 6 }) {
  const style = rawStyle && typeof rawStyle === "object" && !Array.isArray(rawStyle) ? rawStyle : {};
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Write the markup here, not via dangerouslySetInnerHTML: React re-applies
    // that on later renders and wipes the example values filled in below.
    el.querySelector(".w-card").innerHTML = widgetCardHTML(widget);
    if (PREVIEW_WIDGETS.includes(widget)) {
      el.querySelector(".w-pv-title").textContent = widgetDisplayName(widget, t);
      el.querySelector(".w-pv-sub").textContent = t("overhaul.sample");
    } else if (RING_WIDGETS.includes(widget)) {
      const values = { cpu: 28, ram: 62, disk: 41, battery: 78, volume: 55 };
      setMetric(el, widgetDisplayName(widget, t), values[widget] || 0);
    } else if (widget === "clock") {
      const parts = clockParts(new Date(), curLang());
      setText(el, parts.date, parts.time);
    } else {
      const examples = { media: [t("w.media"), t("overhaul.sample")], net: ["↑ 128 KB/s", "↓ 2.4 MB/s"], uptime: [t("w.uptime"), "2h 15m"], timer: [t("w.timer"), "25:00"], calendar: [t("w.calendar"), new Date().getDate().toString()], tasks: [t("w.tasks"), "0 / 3"], weather: [t("w.weather"), "21°"] };
      const values = examples[widget] || [widgetDisplayName(widget, t), "—"];
      setText(el, ...values);
      if (widget === "net") {
        const paths = sparkPaths([2, 5, 3, 8, 4, 6, 3, 5]);
        el.querySelector(".w-spark-line")?.setAttribute("d", paths.line);
        el.querySelector(".w-spark-fill")?.setAttribute("d", paths.fill);
      }
    }
  }, [widget, style, size]);
  return <span ref={ref} className={"tile widget preview-static" + (PREVIEW_WIDGETS.includes(widget) ? " preview" : "") + (style.icon === false ? " no-ico" : "")}
    data-widget={widget} data-variant={style.variant || "glass"} aria-label={widgetDisplayName(widget, t)}
    style={{ "--size": `${size}px`, "--w-accent": style.color || WIDGET_META[widget]?.accent, "--widget-width": `${widgetWidth(widget, size, gap, style)}px`, width: widgetWidth(widget, size, gap, style) }}>
    <span className="w-card" />
  </span>;
}
function PreviewPin({ item, size, gap }) {
  const [src, setSrc] = useState(() => isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon || null);
  useEffect(() => {
    let alive = true;
    if (isLibIcon(item.icon)) { setSrc(resolveLibIcon(item.icon)); return; }
    if (item.icon) { setSrc(item.icon); return; }
    setSrc(null);
    if (item.kind === "app" && item.path) dock.appIcon(item.path).then((uri) => { if (alive) setSrc(uri); }).catch(() => {});
    return () => { alive = false; };
  }, [item.icon, item.path, item.kind]);
  if (item.kind === "widget") return <WidgetPreview widget={item.widget} style={item.style} size={size} gap={gap} />;
  if (item.kind === "separator") return <span className="live-preview-separator" />;
  return <span className="live-preview-app" title={item.name} style={{ width: size, height: size }}>
    {item.kind === "group" ? <span className="live-preview-group">{(item.children || []).slice(0, 4).map((child) => <span key={child.id}>{child.name?.charAt(0) || "•"}</span>)}</span>
      : src ? <img src={src} alt="" />
        : item.kind === "folder" || item.kind === "trash" || item.kind === "action" ? <span dangerouslySetInnerHTML={{ __html: icon(item.kind === "trash" ? "trash" : item.kind === "action" ? "settings" : "folder") }} />
          : <span>{item.name?.charAt(0)?.toUpperCase() || "•"}</span>}
  </span>;
}
export function DockPreview({ cfg, large = false, onSelect, onDragPin, onDropPin, onDragOver }) {
  const gap = cfg.spacing ?? 6;
  const vertical = cfg.edge === "left" || cfg.edge === "right";
  const size = large ? Math.max(32, Math.min(56, cfg.iconSize || 48)) : 32;
  const surface = transparencyReduced(cfg) ? "solid" : resolveSurfaceStyle(cfg);
  const fill = glassFillColor(cfg);
  const items = cfg.pinned || [];
  return <div className={"live-preview-scene" + (large ? " large" : "")}>
    <div className={"live-preview-bar" + (vertical ? " vertical" : "")} data-surface={surface} style={{ "--gap": `${gap}px`, "--ink": surfaceForeground(cfg) || undefined, color: surfaceForeground(cfg) || undefined, gap, borderRadius: dockRadius(cfg),
      background: `color-mix(in srgb, ${fill} ${Math.round((transparencyReduced(cfg) ? 1 : surfaceAlpha(cfg)) * 100)}%, transparent)` }}>
      {items.length ? items.map((item) => onSelect && item.kind !== "separator" ? <button key={item.id} className="preview-edit-pin" type="button" aria-label={`${t("apps.rename")}: ${item.name || widgetDisplayName(item.widget, t)}`} onClick={() => onSelect(item)} draggable={!!onDragPin} onDragStart={onDragPin ? (event) => onDragPin(event, item) : undefined} onDragOver={onDragOver} onDrop={onDropPin ? (event) => onDropPin(event, item) : undefined}><PreviewPin item={item} size={size} gap={gap} /></button> : <PreviewPin key={item.id} item={item} size={size} gap={gap} />) : <span className="muted">{t("overhaul.empty")}</span>}
    </div>
    <span className="live-preview-caption">{onSelect ? t("premium.editPreview") : t("overhaul.previewHint")}</span>
  </div>;
}
