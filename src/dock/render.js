/* Building the bar: one tile per pin, swapped in as a single DOM update. */

import { dock as dockApi } from "../api.js";
import { imageSrc } from "../image-src.js";
import { setTileLabel } from "./tooltip.js";
import { widgetWidth } from "./layout-model.js";
import { icon } from "../icons.js";
import { emo } from "../emoji.js";
import { isLibIcon, resolveLibIcon, libGlyphSVG } from "../icon-library.js";
import { t } from "../i18n.js";
import {
  WIDGET_ICONS,
  WIDGET_GLYPHS,
  PREVIEW_WIDGETS,
  RING_DEFAULTS,
  WIDGET_META,
  canonicalWidget,
} from "../widgets-meta.js";
import {
  MEDIA_SVG,
  widgetCardHTML,
  setPreviewSubText,
  refreshPreviewMarquees,
  LIVE_WIDGETS,
} from "./widget-view.js";
import { groupAppearance } from "../group-style.js";
import { pinFallback } from "../pin-fallback.js";
import { S } from "./state.js";
import { iconCache, baseSize, widgetLabel, syncIcon, resolveIcon } from "./helpers.js";
import { dockEl, dockKeys } from "./dom.js";
import { fitDock } from "./frame.js";
import { cacheWidgetEls, tickClocks, syncPolls, refreshMedia } from "./live-widgets.js";
import { scheduleFocusAlerts } from "./focus-alerts.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wireRender(fns) { Object.assign(deps, fns); }

// ──────────────────────────── Render ────────────────────────────

// Remember which ids were on the bar last render, so only genuinely NEW tiles
// animate in (not every tile on an unrelated re-render).
let lastRenderIds = new Set();
let renderGeneration = 0;

export async function render() {
  const generation = ++renderGeneration;
  const snapshot = S.cfg;
  scheduleFocusAlerts(snapshot.pinned);
  // Build every tile in parallel and swap the whole bar in ONE DOM operation —
  // no icons popping in one by one, no empty-bar flash between renders.
  const tiles = await Promise.all(
    snapshot.pinned.map((item) => {
      if (item.kind === "separator") return separatorTile(item);
      if (item.kind === "group") return groupTile(item);
      if (item.kind === "widget") return widgetTile(item);
      if (item.kind === "trash") return trashTile(item);
      if (item.kind === "action") return actionTile(item);
      return appTile(item);
    })
  );
  if (generation !== renderGeneration || S.cfg !== snapshot) return;
  // Fade+scale in only the tiles that weren't on the bar before.
  const prevIds = lastRenderIds;
  for (const el of tiles) {
    const id = el.dataset && el.dataset.id;
    if (id && !prevIds.has(id)) el.classList.add("tile-in");
  }
  dockEl.replaceChildren(...tiles);
  lastRenderIds = new Set(S.cfg.pinned.map((p) => p.id));
  cacheWidgetEls();
  requestAnimationFrame(refreshPreviewMarquees);

  // Empty state opens the same searchable app/widget panel as the dock menu.
  if (!S.cfg.pinned.some((p) => p.kind !== "separator")) {
    const hint = document.createElement("button");
    hint.className = "tile hint";
    hint.style.setProperty("--size", `${baseSize()}px`);
    hint.title = t("dock.emptyAdd");
    // The capybara mascot waves you in — friendlier than a bare "+".
    hint.innerHTML =
      `<span class="label">${t("dock.emptyAdd")}</span>` +
      `<span class="hint-capy"><img src="/brand/svg/isotype.svg" alt="" draggable="false" />` +
      `<span class="hint-plus-badge">${icon("plus")}</span></span>`;
    hint.addEventListener("click", () => deps.openAddPanel(hint));
    hint.addEventListener("contextmenu", (e) => deps.openBackgroundMenu(e));
    dockEl.appendChild(hint);
  }
  dockKeys.sync();

  fitDock();
  // Repaint widget values right away so a freshly built card never lingers on
  // its "…" placeholder (e.g. after adding a widget or any structural re-render).
  // syncPolls() paints at once and restarts timers only if the live widget
  // kinds changed; it self-guards while the dock is tucked away.
  if (!S.hiddenState) syncPolls();
}

function actionTile(item) {
  const el = document.createElement("button"); el.className = "tile action-tile";
  const label = item.name && item.name !== "Booki" ? item.name : t("m.settings");
  el.dataset.id = item.id; setTileLabel(el, label);
  el.style.setProperty("--size", `${baseSize()}px`);
  const fallback = () => { const glyph = document.createElement("span"); glyph.className = "action-icon"; glyph.innerHTML = icon("settings"); el.appendChild(glyph); };
  if (item.icon) {
    const img = document.createElement("img"); img.alt = "";
    img.addEventListener("error", () => { img.remove(); fallback(); }, { once: true });
    img.src = isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon; el.appendChild(img);
  } else fallback();
  el.addEventListener("contextmenu", (e) => deps.openMenu(e, item));
  const rm = document.createElement("span"); rm.className = "rm"; rm.setAttribute("aria-hidden", "true"); rm.innerHTML = icon("x"); rm.title = t("apps.remove");
  rm.addEventListener("pointerdown", (e) => e.stopPropagation());
  rm.addEventListener("click", (e) => { e.stopPropagation(); deps.removeItem(item.id); }); el.appendChild(rm);
  el.addEventListener("pointerdown", (e) => deps.onPointerDown(e, el, item)); return el;
}

function appTile(item) {
  const el = document.createElement("button");
  el.className = "tile";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  // Accessible name is independent of the custom hover/focus hint.
  setTileLabel(el, item.name);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.name;
  el.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "badge";
  el.appendChild(badge);

  const addGlyph = () => {
    if (el.querySelector(".glyph, img")) return;
    const look = pinFallback(item);
    const glyph = document.createElement("span");
    glyph.className = "glyph fallback";
    glyph.style.setProperty("--fb-color", look.color);
    glyph.style.setProperty("--fb-deep", look.deep);
    glyph.style.setProperty("--fb-ink", look.ink);
    if (look.glyph) glyph.innerHTML = icon(look.glyph);
    else glyph.textContent = look.letter;
    el.appendChild(glyph);
  };
  const addImg = (src) => {
    const img = document.createElement("img");
    img.alt = item.name;
    // If the icon fails to decode, drop it, show the initial glyph, and forget
    // the cached value so a later render can try extracting it again.
    img.addEventListener("error", () => {
      img.remove();
      iconCache.delete(item.path);
      addGlyph();
    });
    img.src = imageSrc(src);
    el.appendChild(img);
  };
  // Show the icon we already have instantly; otherwise a shimmer skeleton while
  // it extracts (cold app icons take a beat on Windows) — never a blank tile.
  const now = syncIcon(item);
  if (now) {
    addImg(now);
  } else {
    const skel = document.createElement("span");
    skel.className = "glyph skel";
    el.appendChild(skel);
    resolveIcon(item)
      .then((src) => { skel.remove(); src ? addImg(src) : addGlyph(); })
      .catch(() => { skel.remove(); addGlyph(); });
  }

  // Remove badge — only visible in edit mode.
  const rm = document.createElement("span");
  rm.className = "rm"; rm.setAttribute("aria-hidden", "true");
  rm.innerHTML = icon("x");
  rm.title = t("apps.remove");
  rm.addEventListener("pointerdown", (e) => e.stopPropagation());
  rm.addEventListener("click", (e) => {
    e.stopPropagation();
    deps.removeItem(item.id);
  });
  el.appendChild(rm);

  el.addEventListener("contextmenu", (e) => deps.openMenu(e, item));
  el.addEventListener("pointerdown", (e) => deps.onPointerDown(e, el, item));
  return el;
}

// A "folder"/group tile — shows up to four child icons in a mini grid (iOS-style)
// and opens a flyout with its contents on click.
function groupTile(item) {
  const el = document.createElement("button");
  el.className = "tile group";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  const look = groupAppearance(item);
  if (look.color) { el.style.setProperty("--group-color", look.color); el.style.setProperty("--group-ink", look.ink); el.classList.add("tinted"); }
  setTileLabel(el, item.name || t("group.new"));

  const grid = document.createElement("span");
  grid.className = "group-grid";
  const setMiniImg = (mini, src) => {
    const img = document.createElement("img");
    img.src = imageSrc(src);
    img.alt = "";
    mini.appendChild(img);
  };
  const setMiniLetter = (mini, child) => {
    const look = pinFallback(child);
    mini.classList.add("fallback");
    mini.style.setProperty("--fb-color", look.color);
    mini.style.setProperty("--fb-deep", look.deep);
    mini.style.setProperty("--fb-ink", look.ink);
    if (look.glyph) mini.innerHTML = icon(look.glyph);
    else mini.textContent = look.letter;
  };
  const kids = (item.children || []).slice(0, 4);
  for (const child of kids) {
    const mini = document.createElement("span");
    mini.className = "group-mini";
    if (child.kind === "widget") {
      // A grouped widget previews as its emoji (it only goes live inside the group).
      mini.innerHTML = WIDGET_GLYPHS[child.widget] ? icon(WIDGET_GLYPHS[child.widget]) : emo(WIDGET_ICONS[child.widget] || "puzzle", 18);
    } else {
      const now = syncIcon(child);
      if (now) {
        setMiniImg(mini, now);
      } else {
        mini.classList.add("skel");
        resolveIcon(child)
          .then((src) => { mini.classList.remove("skel"); src ? setMiniImg(mini, src) : setMiniLetter(mini, child); })
          .catch(() => { mini.classList.remove("skel"); setMiniLetter(mini, child); });
      }
    }
    grid.appendChild(mini);
  }
  if (!kids.length) grid.innerHTML = icon("grid");
  if (look.glyph) {
    // A glyph makes the group a solid badge in its colour.
    el.classList.add("badge-group");
    grid.innerHTML = libGlyphSVG(look.glyph);
  } else if (item.icon) {
    const fallback = [...grid.childNodes];
    const cover = document.createElement("img"); cover.className = "group-cover"; cover.alt = "";
    cover.addEventListener("error", () => grid.replaceChildren(...fallback), { once: true });
    cover.src = isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon;
    grid.replaceChildren(cover);
  }
  el.appendChild(grid);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.name || t("group.new");
  el.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "badge";
  el.appendChild(badge);

  const rm = document.createElement("span");
  rm.className = "rm"; rm.setAttribute("aria-hidden", "true");
  rm.innerHTML = icon("x");
  rm.title = t("apps.remove");
  rm.addEventListener("pointerdown", (e) => e.stopPropagation());
  rm.addEventListener("click", (e) => {
    e.stopPropagation();
    deps.removeItem(item.id);
  });
  el.appendChild(rm);

  el.addEventListener("contextmenu", (e) => deps.openMenu(e, item));
  el.addEventListener("pointerdown", (e) => deps.onPointerDown(e, el, item));
  return el;
}

// Recycle Bin pin: drop files on it to delete (with an in-dock confirmation);
// click opens the bin. The icon tints when the bin has items in it.
function trashTile(item) {
  const el = document.createElement("button");
  el.className = "tile trash";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  setTileLabel(el, t("trash.name"));
  el.innerHTML =
    `<span class="label">${t("trash.name")}</span>` +
    `<span class="badge trash-count"></span>` +
    `<span class="trash-glyph">${icon("trash")}</span>`;
  el.addEventListener("contextmenu", (e) => deps.openMenu(e, item));
  el.addEventListener("pointerdown", (e) => deps.onPointerDown(e, el, item));
  refreshTrashState(el);
  return el;
}

export async function refreshTrashState(el) {
  const tile = el || dockEl.querySelector(".tile.trash");
  if (!tile) return;
  const count = await dockApi.trashCount().catch(() => 0);
  tile.classList.toggle("full", count > 0);
  const badge = tile.querySelector(".trash-count");
  if (badge) badge.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
  setTileLabel(tile, count > 0 ? `${t("trash.name")} · ${count}` : t("trash.name"));
}

function separatorTile(item) {
  const el = document.createElement("div");
  el.className = "tile separator";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${Math.round(baseSize() * 0.5)}px`);
  el.innerHTML = `<span class="sep-line"></span>`;
  el.addEventListener("contextmenu", (e) => deps.openMenu(e, item));
  el.addEventListener("pointerdown", (e) => deps.onPointerDown(e, el, item));
  return el;
}

// ───────────────────────────── Widgets ─────────────────────────────
// macOS-style "cards" living in the dock: a live clock, CPU%, RAM% and network
// throughput. Cheap by design — stats only poll while the dock is visible.

export function widgetTile(item, { inFlyout = false } = {}) {
  const type = canonicalWidget(item.widget || "clock") || "clock";
  const st = item.style || {};
  const el = document.createElement("button");
  el.className = "tile widget" + (inFlyout ? " in-flyout" : "");
  el.dataset.id = item.id;
  el.dataset.widget = type;
  el.dataset.span = String(st.span || "auto");
  el.style.setProperty("--widget-width", `${widgetWidth(type, baseSize(), S.cfg.spacing ?? 6, st)}px`);
  el.dataset.variant = st.variant || "glass";
  if (type === "media" && st.scrollVolume) el.dataset.scrollVolume = "1";
  if (st.color) el.style.setProperty("--w-accent", st.color);
  else if (RING_DEFAULTS[type]) {
    el.style.setProperty("--w-accent", RING_DEFAULTS[type]);
    el.dataset.autoAccent = "1"; // no custom color set → the battery ring may still shift to red when low
  } else if (WIDGET_META[type]) {
    el.style.setProperty("--w-accent", WIDGET_META[type].accent);
  }
  if (st.animated) el.classList.add("animated");
  if (st.icon === false) el.classList.add("no-ico");
  el.style.setProperty("--size", `${baseSize()}px`);
  setTileLabel(el, widgetLabel(type));
  if (LIVE_WIDGETS.includes(type)) el.setAttribute("aria-live", "polite");

  const card = document.createElement("span");
  card.className = "w-card";
  if (PREVIEW_WIDGETS.includes(type)) el.classList.add("preview");
  card.innerHTML = widgetCardHTML(type, st);
  el.appendChild(card);

  // On the bar the widget is a full dock tile (removable, draggable, right-click
  // menu). Inside a group flyout it's just a live read-out — the flyout supplies
  // its own take-out/remove and drag-out gestures, so skip the dock wiring.
  if (!inFlyout) {
    const rm = document.createElement("span");
    rm.className = "rm"; rm.setAttribute("aria-hidden", "true");
    rm.innerHTML = icon("x");
    rm.title = t("apps.remove");
    rm.addEventListener("pointerdown", (e) => e.stopPropagation());
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      deps.removeItem(item.id);
    });
    el.appendChild(rm);
    el.addEventListener("contextmenu", (e) => deps.openMenu(e, item));
    el.addEventListener("pointerdown", (e) => deps.onPointerDown(e, el, item));
  }
  if (type === "media") {
    el.classList.add("media");
    const art = document.createElement("img");
    art.className = "w-art";
    art.alt = "";
    card.prepend(art);
    el.querySelector(".w-label").textContent = t("w.media");
    el.querySelector(".w-value").textContent = "—";
    el.querySelector(".w-bar").style.display = "none";
    // Hover controls: previous · play/pause · next (click on the card itself
    // still toggles play/pause). Crisp SVG glyphs, not text emoji.
    const controls = document.createElement("span");
    controls.className = "w-controls";
    const mkCtl = (label, svg, fn, cls) => {
      const b = document.createElement("button");
      b.className = "w-ctl" + (cls ? ` ${cls}` : "");
      b.title = label;
      b.setAttribute("aria-label", label);
      b.innerHTML = svg;
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        // A failing native media call must never bubble as an uncaught error.
        try { await fn(); } catch (_) {}
        setTimeout(refreshMedia, 350); // refresh title/state right away
      });
      controls.appendChild(b);
    };
    mkCtl(t("w.prev"), MEDIA_SVG.prev, () => dockApi.mediaPrev());
    mkCtl(t("w.playPause"), MEDIA_SVG.play, () => dockApi.mediaToggle(), "w-ctl-toggle");
    mkCtl(t("w.next"), MEDIA_SVG.next, () => dockApi.mediaNext());
    card.appendChild(controls);
  }
  if (["clock", "focus", "calendar", "weather"].includes(type)) tickClocks();
  if (type === "notes") {
    el.querySelector(".w-pv-title").textContent = t("w.notes");
    setPreviewSubText(el, st.note || t("w.notesEmpty"), !st.note);
    setTileLabel(el, widgetLabel("notes"));
  }
  if (type === "clipboard") {
    el.querySelector(".w-pv-title").textContent = t("w.clipboard");
    setPreviewSubText(el, t("clip.empty"), true);
  }
  return el;
}
