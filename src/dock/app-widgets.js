/* App widgets: a pinned app shown as a wide live card instead of an icon.
   Opt-in per app from its right-click menu. A player shows what it is playing
   (the Media read-out, only when that app owns the media session), a browser
   its open windows with new / private window buttons, a calendar app the
   date. Everything comes from local Windows state; no accounts, no network. */

import { dock as dockApi } from "../api.js";
import { icon } from "../icons.js";
import { t, curLang } from "../i18n.js";

const KINDS = [
  { kind: "player", match: /spotify|itunes|applemusic|music\.ui|zunemusic|vlc|foobar|tidal|deezer|winamp|musicbee|aimp|amazon ?music|youtube ?music/ },
  { kind: "browser", match: /chrome|msedge|firefox|brave|opera|vivaldi|\barc\b|zen|librewolf|waterfox|floorp/ },
  { kind: "calendar", match: /outlook|olk\.exe|hxoutlook|calendar|thunderbird/ },
];

/** player | browser | calendar | null, from the pin's path and name. */
export function appWidgetKind(item) {
  if (item?.kind !== "app") return null;
  const hay = `${item.path || ""} ${item.name || ""}`.toLowerCase();
  return KINDS.find((k) => k.match.test(hay))?.kind || null;
}

export const isAppWidget = (item) => item?.style?.appWidget === "wide" && !!appWidgetKind(item);

/** Does the media session (AppUserModelID) belong to this pinned app? */
export function ownsMedia(item, source) {
  if (!source) return false;
  const src = String(source).toLowerCase();
  const exe = (item.path || "").split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|lnk)$/, "");
  const name = (item.name || "").toLowerCase().replace(/\s+/g, "");
  return (!!exe && src.includes(exe)) || (!!name && src.replace(/\s+/g, "").includes(name));
}

// Private-window flag per browser, for the card's second button.
const PRIVATE_FLAGS = [[/msedge/, "--inprivate"], [/firefox|librewolf|waterfox|floorp|zen/, "--private-window"], [/opera/, "--private"], [/chrome|brave|vivaldi/, "--incognito"]];
export function privateFlag(item) {
  const hay = (item.path || "").toLowerCase();
  return PRIVATE_FLAGS.find(([re]) => re.test(hay))?.[1] || "";
}

function miniButton(glyph, label, run) {
  const b = document.createElement("span");
  b.className = "aw-btn"; b.setAttribute("role", "button"); b.tabIndex = -1;
  b.title = label; b.setAttribute("aria-label", label);
  b.innerHTML = icon(glyph);
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => { e.stopPropagation(); run(); });
  return b;
}

/** Turn an app tile into its wide card. `mediaTile` builds the live Media
 *  read-out (render.js owns widget tiles). */
export function decorateAppWidget(el, item, { mediaTile }) {
  const kind = appWidgetKind(item);
  el.classList.add("app-wide", `app-wide-${kind}`);
  el.dataset.appWidget = kind;
  const body = document.createElement("span");
  body.className = "aw-body";
  if (kind === "player") {
    const media = mediaTile({ id: `${item.id}::media`, kind: "widget", widget: "media", style: {} });
    media.classList.add("aw-media");
    media.dataset.appId = item.id;
    media.tabIndex = -1;
    body.appendChild(media);
  } else {
    const text = document.createElement("span");
    text.className = "aw-text";
    text.innerHTML = `<span class="aw-title"></span><span class="aw-sub"></span>`;
    body.appendChild(text);
    const actions = document.createElement("span");
    actions.className = "aw-actions";
    if (kind === "browser") {
      actions.appendChild(miniButton("plus", t("m.newWindow"), () => dockApi.launch(item.path, item.args || []).catch(() => {})));
      const flag = privateFlag(item);
      if (flag) actions.appendChild(miniButton("lock", t("aw.private"), () => dockApi.launch(item.path, [...(item.args || []), flag]).catch(() => {})));
    }
    actions.appendChild(miniButton("external", t("aw.openApp"), () => dockApi.launch(item.path, item.args || []).catch(() => {})));
    body.appendChild(actions);
  }
  el.appendChild(body);
  paintAppWidget(el, item, []);
}

/** Refresh the text of a browser or calendar card from the window list. */
export function paintAppWidget(el, item, wins) {
  const kind = el.dataset.appWidget;
  const title = el.querySelector(".aw-title");
  const sub = el.querySelector(".aw-sub");
  if (!title || !sub) return;
  if (kind === "browser") {
    const n = wins.length;
    title.textContent = n ? t(n === 1 ? "aw.window" : "aw.windows").replace("{n}", String(n)) : item.name;
    sub.textContent = n ? (wins[0].title || "") : t("aw.notOpen");
  } else if (kind === "calendar") {
    const now = new Date();
    const day = now.toLocaleDateString(curLang(), { weekday: "long" });
    title.textContent = day.charAt(0).toUpperCase() + day.slice(1);
    sub.textContent = now.toLocaleDateString(curLang(), { day: "numeric", month: "long" });
  }
}
