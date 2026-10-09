/* A group's colour and icon. Both are optional: without them the tile shows
   a grid of its first apps, as it always has. */
import React, { useState } from "react";
import { t } from "../i18n.js";
import { GROUP_COLORS, groupAppearance } from "../group-style.js";
import { ICON_LIBRARY, libGlyphSVG } from "../icon-library.js";
import { Icon } from "./ui.jsx";

const FIRST_GLYPHS = 15;

export function GroupLook({ item, onChange }) {
  const { color, glyph } = groupAppearance(item);
  const [allGlyphs, showAllGlyphs] = useState(() => ICON_LIBRARY.indexOf(glyph) >= FIRST_GLYPHS);
  const style = (patch) => {
    const next = { ...(item.style || {}), ...patch };
    for (const key of Object.keys(patch)) if (!next[key]) delete next[key];
    onChange(Object.keys(next).length ? next : null);
  };
  const glyphs = allGlyphs ? ICON_LIBRARY : ICON_LIBRARY.slice(0, FIRST_GLYPHS);
  return <div className="group-look" style={{ "--group-color": color || "var(--accent)" }}>
    <span className="group-look-label">{t("group.color")}</span>
    <div className="group-look-colors" role="radiogroup" aria-label={t("group.color")}>
      <button type="button" role="radio" className="group-swatch auto" aria-checked={!color} title={t("group.auto")} aria-label={t("group.auto")} onClick={() => style({ color: "" })} />
      {GROUP_COLORS.map(([name, hex]) => <button key={name} type="button" role="radio" className="group-swatch" style={{ "--sw": hex }}
        aria-checked={color === hex} title={t(`color.${name}`)} aria-label={t(`color.${name}`)} onClick={() => style({ color: hex })} />)}
    </div>
    <span className="group-look-label">{t("group.icon")}<small>{t("group.iconHint")}</small></span>
    <div className="group-look-glyphs" role="radiogroup" aria-label={t("group.icon")}>
      <button type="button" role="radio" className="group-glyph none" aria-checked={!glyph} title={t("group.auto")} aria-label={t("group.auto")} onClick={() => style({ glyph: "" })}><Icon name="grid" /></button>
      {glyphs.map((name) => <button key={name} type="button" role="radio" className="group-glyph" aria-checked={glyph === name} title={name} aria-label={name}
        onClick={() => style({ glyph: name })} dangerouslySetInnerHTML={{ __html: libGlyphSVG(name) }} />)}
      {!allGlyphs && ICON_LIBRARY.length > FIRST_GLYPHS && <button type="button" className="group-glyph more" onClick={() => showAllGlyphs(true)}>{t("apps.more")}</button>}
    </div>
  </div>;
}
