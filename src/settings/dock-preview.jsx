import { groupAppearance } from "../group-style.js";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { widgetCardHTML, setText, setMetric, setSystem, clockParts } from "../dock/widget-view.js";
import { widgetWidth } from "../dock/layout-model.js";
import { WIDGET_META, WIDGET_GLYPHS, RING_WIDGETS, PREVIEW_WIDGETS, widgetDisplayName, canonicalWidget } from "../widgets-meta.js";
import { t, curLang } from "../i18n.js";
import { dock } from "../api.js";
import { isLibIcon, libGlyphSVG, resolveLibIcon } from "../icon-library.js";
import { icon } from "../icons.js";
import { pinFallback } from "../pin-fallback.js";
import { resolveSurfaceStyle, glassFillColor, surfaceAlpha, dockRadius, surfaceForeground, transparencyReduced } from "../surface.js";

/* The real widget markup/styles, with safe example data. Private notes and
   clipboard contents never appear in a preview or diagnostic screenshot. */
const SAMPLE_STATS = { cpu: 28, mem: 62, disk: 41, net_down_kbps: 2458, net_up_kbps: 128 };
export function WidgetPreview({ widget: rawWidget, style: rawStyle, size = 48, gap = 6 }) {
  const style = rawStyle && typeof rawStyle === "object" && !Array.isArray(rawStyle) ? rawStyle : {};
  const widget = canonicalWidget(rawWidget) || "clock";
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Write the markup here, not via dangerouslySetInnerHTML: React re-applies
    // that on later renders and wipes the example values filled in below.
    el.querySelector(".w-card").innerHTML = widgetCardHTML(widget, style);
    if (widget === "system") {
      setSystem(el, SAMPLE_STATS, { cpu: "CPU", ram: "RAM", disk: t("w.disk"), net: t("w.net") });
    } else if (PREVIEW_WIDGETS.includes(widget)) {
      el.querySelector(".w-pv-title").textContent = widgetDisplayName(widget, t);
      el.querySelector(".w-pv-sub").textContent = t(widget === "notes" ? "w.notesEmpty" : "clip.empty");
    } else if (RING_WIDGETS.includes(widget)) {
      setMetric(el, widgetDisplayName(widget, t), { battery: 78, volume: 55 }[widget] || 0);
    } else if (widget === "clock") {
      const parts = clockParts(new Date(), curLang());
      setText(el, parts.date, parts.time);
    } else {
      const examples = { media: [t("w.media"), t("w.mediaIdle")], focus: [t("w.focus"), "25:00"], calendar: [new Date().toLocaleDateString(curLang(), { month: "short", weekday: "short" }), String(new Date().getDate())], weather: [t("w.weather"), "21°"] };
      setText(el, ...(examples[widget] || [widgetDisplayName(widget, t), "—"]));
    }
  }, [widget, style, size]);
  const width = widgetWidth(widget, size, gap, style);
  return <span ref={ref} className={"tile widget preview-static" + (PREVIEW_WIDGETS.includes(widget) ? " preview" : "") + (style.icon === false ? " no-ico" : "")}
    data-widget={widget} data-variant={style.variant || "glass"} aria-label={widgetDisplayName(widget, t)}
    style={{ "--size": `${size}px`, "--gap": `${gap}px`, "--w-accent": style.color || WIDGET_META[widget]?.accent, "--widget-width": `${width}px`, width }}>
    <span className="w-card" />
  </span>;
}
/** The same coloured initial (or globe) the dock draws for a pin with no icon. */
function FallbackGlyph({ item, size }) {
  const look = pinFallback(item);
  const style = { "--fb-color": look.color, "--fb-deep": look.deep, "--fb-ink": look.ink, fontSize: Math.round(size * 0.38) };
  return look.glyph
    ? <span className="preview-fallback" style={style} dangerouslySetInnerHTML={{ __html: icon(look.glyph) }} />
    : <span className="preview-fallback" style={style}>{look.letter}</span>;
}
export function PreviewPin({ item, size = 40, gap = 6 }) {
  const [src, setSrc] = useState(() => isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon || null);
  useEffect(() => {
    let alive = true;
    if (isLibIcon(item.icon)) { setSrc(resolveLibIcon(item.icon)); return; }
    if (item.icon) { setSrc(item.icon); return; }
    setSrc(null);
    if (item.kind === "app" && item.path) dock.appIcon(item.path).then((uri) => { if (alive) setSrc(uri); }).catch(() => {});
    return () => { alive = false; };
  }, [item.icon, item.path, item.kind]);
  if (item.kind === "widget" && canonicalWidget(item.widget) === null) return null; // retired widget in an old profile
  if (item.kind === "widget") return <WidgetPreview widget={item.widget} style={item.style} size={size} gap={gap} />;
  if (item.kind === "separator") return <span className="live-preview-separator" />;
  const look = item.kind === "group" ? groupAppearance(item) : null;
  if (look?.glyph) return <span className="live-preview-app live-preview-badge" title={item.name}
    style={{ width: size, height: size, "--group-color": look.color || "var(--accent)", "--group-ink": look.ink || "var(--accent-contrast)" }}
    dangerouslySetInnerHTML={{ __html: libGlyphSVG(look.glyph) }} />;
  return <span className="live-preview-app" title={item.name} style={{ width: size, height: size, ...(look?.color ? { background: `color-mix(in srgb, ${look.color} 30%, transparent)` } : {}) }}>
    {item.kind === "group" ? <span className="live-preview-group">{(item.children || []).slice(0, 4).map((child) => <span key={child.id}>{child.kind === "widget" ? <span className="live-preview-mini-widget" dangerouslySetInnerHTML={{ __html: icon(WIDGET_GLYPHS[canonicalWidget(child.widget)] || "sparkles") }} /> : <PreviewPin item={child} size={14} gap={2} />}</span>)}</span>
      : src ? <img src={src} alt="" />
        : item.kind === "folder" || item.kind === "trash" || item.kind === "action" ? <span dangerouslySetInnerHTML={{ __html: icon(item.kind === "trash" ? "trash" : item.kind === "action" ? "settings" : "folder") }} />
          : <FallbackGlyph item={item} size={size} />}
  </span>;
}
/* The preview always shows the whole dock: it scales down to fit its column
   instead of scrolling, so the bar never grows an inner scrollbar. */
function useFitScale(maxHeight) {
  const frame = useRef(null);
  const bar = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const outer = frame.current, inner = bar.current;
    if (!outer || !inner) return;
    const measure = () => {
      const width = inner.offsetWidth, height = inner.offsetHeight;
      if (!width || !height) return;
      const scale = Math.min(1, outer.clientWidth / width, maxHeight / height);
      setFit((prev) => Math.abs(prev.scale - scale) < 0.005 && prev.height === Math.ceil(height * scale) ? prev : { scale, height: Math.ceil(height * scale) });
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [maxHeight]);
  return { frame, bar, fit };
}
export function DockPreview({ cfg, large = false, stage = false, onSelect, onDragPin, onDropPin, onDragOver }) {
  const gap = cfg.spacing ?? 6;
  const vertical = cfg.edge === "left" || cfg.edge === "right";
  const size = large ? Math.max(32, Math.min(56, cfg.iconSize || 48)) : 32;
  const surface = transparencyReduced(cfg) ? "solid" : resolveSurfaceStyle(cfg);
  const fill = glassFillColor(cfg);
  const items = cfg.pinned || [];
  const { frame, bar, fit } = useFitScale(vertical ? 300 : 140);
  // `stage` sets the dock on a small desktop scene, on its own edge.
  return <div className={"live-preview-scene" + (large ? " large" : "") + (stage ? ` stage at-${cfg.edge || "bottom"}` : "")}>
    <div ref={frame} className="live-preview-fit" style={{ height: fit.height || undefined }}>
    <div ref={bar} className={"live-preview-bar" + (vertical ? " vertical" : "")} data-surface={surface} data-ink={surfaceForeground(cfg) ? (surfaceForeground(cfg) === "#1b1b1b" ? "dark" : "light") : undefined} style={{ "--gap": `${gap}px`, "--ink": surfaceForeground(cfg) || undefined, color: surfaceForeground(cfg) || undefined, gap, borderRadius: dockRadius(cfg),
      transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined,
      background: `color-mix(in srgb, ${fill} ${Math.round((transparencyReduced(cfg) ? 1 : surfaceAlpha(cfg)) * 100)}%, transparent)` }}>
      {items.length ? items.map((item) => onSelect && item.kind !== "separator" ? <button key={item.id} className="preview-edit-pin" type="button" aria-label={`${t("apps.rename")}: ${item.name || widgetDisplayName(item.widget, t)}`} onClick={() => onSelect(item)} draggable={!!onDragPin} onDragStart={onDragPin ? (event) => onDragPin(event, item) : undefined} onDragOver={onDragOver} onDrop={onDropPin ? (event) => onDropPin(event, item) : undefined}><PreviewPin item={item} size={size} gap={gap} /></button> : <PreviewPin key={item.id} item={item} size={size} gap={gap} />) : <span className="muted">{t("overhaul.empty")}</span>}
    </div>
    </div>
    <span className="live-preview-caption">{onSelect ? t("premium.editPreview") : t("overhaul.previewHint")}</span>
  </div>;
}
