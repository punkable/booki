/* A group's colour and icon: two compact pickers, each opening a popover.
   Colours come only from the curated palette, so groups stay on-brand. */
import React, { useEffect, useRef, useState } from "react";
import { t } from "../i18n.js";
import { GROUP_PALETTE, groupAppearance } from "../group-style.js";
import { ICON_LIBRARY, libGlyphSVG } from "../icon-library.js";
import { Icon } from "./ui.jsx";

function Popover({ label, preview, children }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); root.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", away); root.current?.addEventListener("keydown", esc);
    const el = root.current;
    return () => { document.removeEventListener("pointerdown", away); el?.removeEventListener("keydown", esc); };
  }, [open]);
  return <div className="look-picker" ref={root}>
    <button type="button" className="look-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      {preview}<span>{label}</span><Icon name="chevron-right" className="look-chev" />
    </button>
    {open && <div className="look-popover" role="dialog" aria-label={label}>{children(() => setOpen(false))}</div>}
  </div>;
}

export function GroupLook({ item, onChange }) {
  const { color, glyph, ink } = groupAppearance(item);
  const style = (patch) => {
    const next = { ...(item.style || {}), ...patch };
    for (const key of Object.keys(patch)) if (!next[key]) delete next[key];
    onChange(Object.keys(next).length ? next : null);
  };
  const family = GROUP_PALETTE.find(([, shades]) => shades.includes(color))?.[0];
  return <div className="group-look" style={{ "--group-color": color || "var(--accent)", "--group-ink": ink || "var(--accent-contrast)" }}>
    <Popover label={family ? t(`color.${family}`) : t("group.color")}
      preview={<span className={"look-dot" + (color ? "" : " auto")} style={color ? { "--sw": color } : undefined} />}>
      {(close) => <>
        <button type="button" className="look-auto" aria-pressed={!color} onClick={() => { style({ color: "" }); close(); }}>{t("group.auto")}</button>
        <div className="look-palette" role="radiogroup" aria-label={t("group.color")}>
          {GROUP_PALETTE.map(([name, shades]) => <div key={name} className="look-family" title={t(`color.${name}`)}>
            {shades.map((hex, i) => <button key={hex} type="button" role="radio" className="group-swatch" style={{ "--sw": hex }}
              aria-checked={color === hex} aria-label={`${t(`color.${name}`)} ${i + 1}`} onClick={() => { style({ color: hex }); close(); }} />)}
          </div>)}
        </div>
      </>}
    </Popover>
    <Popover label={t("group.icon")}
      preview={<span className="look-glyph" dangerouslySetInnerHTML={{ __html: glyph ? libGlyphSVG(glyph) : "" }} />}>
      {(close) => <>
        <p className="look-hint">{t("group.iconHint")}</p>
        <div className="group-look-glyphs" role="radiogroup" aria-label={t("group.icon")}>
          <button type="button" role="radio" className="group-glyph none" aria-checked={!glyph} title={t("group.auto")} aria-label={t("group.auto")} onClick={() => { style({ glyph: "" }); close(); }}><Icon name="grid" /></button>
          {ICON_LIBRARY.map((name) => <button key={name} type="button" role="radio" className="group-glyph" aria-checked={glyph === name} title={name} aria-label={name}
            onClick={() => { style({ glyph: name }); close(); }} dangerouslySetInnerHTML={{ __html: libGlyphSVG(name) }} />)}
        </div>
      </>}
    </Popover>
  </div>;
}
