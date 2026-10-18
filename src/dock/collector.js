/* Collector widget (yt-dlp, FFmpeg, gallery-dl): drop a link on the dock, pick Video or Audio
   only, and the card shows the progress; the panel shows the file when done.
   One download at a time; progress arrives as native events. */
import { dock as api, onDownloadEvent } from "../api.js";
import { t } from "../i18n.js";
import { eachWidget } from "./live-widgets.js";
import { setMetric, setText } from "./widget-view.js";
import { setTileLabel } from "./tooltip.js";

export const download = { state: "idle", percent: 0, title: "", path: "", error: "" };
const listeners = new Set();
const baseName = (path) => String(path || "").split(/[\\/]/).pop();

export function paintDownloads() {
  eachWidget("collector", (el) => {
    el.dataset.state = download.state;
    if (download.state === "progress" || download.state === "start") {
      setMetric(el, download.title || t("w.collector"), Math.round(download.percent));
      setTileLabel(el, `${download.title || t("w.collector")} · ${Math.round(download.percent)}%`);
    } else if (download.state === "done") {
      setMetric(el, baseName(download.path) || t("dl.done"), 100);
      setTileLabel(el, `${t("dl.done")} · ${baseName(download.path)}`);
    } else {
      setText(el, t("w.collector"), "—");
      setTileLabel(el, download.state === "error" ? t("dl.failed") : t("dl.drop"));
    }
  });
}

export function onDownloadChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed() { paintDownloads(); for (const fn of listeners) { try { fn(download); } catch (_) { /* closed panel */ } } }

onDownloadEvent((event) => {
  if (!event) return;
  Object.assign(download, { state: event.state, percent: event.percent ?? 0 });
  if (event.title) download.title = event.title;
  if (event.state === "start") Object.assign(download, { title: "", path: "", error: "" });
  if (event.path) download.path = event.path;
  changed();
});

/** Start a download; resolves with the saved path or throws. */
export async function startDownload(url, format) {
  Object.assign(download, { state: "start", percent: 0, title: "", path: "", error: "" });
  changed();
  try {
    const path = await api.pluginDownload(url, null, format);
    Object.assign(download, { state: "done", percent: 100, path: path || download.path });
    changed();
    return path;
  } catch (error) {
    Object.assign(download, { state: "error", error: String(error?.message ?? error ?? "") });
    changed();
    throw error;
  }
}

/** What a link most likely is, so only video pages ask Video or Audio:
 *  "file" (a direct link to a document, archive, image…), "gallery" (image
 *  posts and boards gallery-dl reads best) or "media" (anything else, for
 *  yt-dlp's hundreds of sites). */
const FILE_EXT = /\.(pdf|zip|7z|rar|tar|gz|exe|msi|iso|dmg|apk|png|jpe?g|gif|webp|avif|svg|bmp|mp3|wav|flac|ogg|m4a|mp4|mkv|mov|webm|docx?|xlsx?|pptx?|odt|txt|csv|epub|torrent)$/i;
const GALLERY_HOSTS = /(^|\.)(pinterest\.[a-z.]+|pin\.it|imgur\.com|deviantart\.com|artstation\.com|flickr\.com|danbooru\.donmai\.us|e621\.net|pixiv\.net|behance\.net|tumblr\.com|bsky\.app)$/i;
export function classifyLink(value) {
  let url;
  try { url = new URL(value); } catch (_) { return "media"; }
  if (FILE_EXT.test(url.pathname)) return "file";
  const host = url.hostname.replace(/^www\./, "");
  if (GALLERY_HOSTS.test(host)) return "gallery";
  if (/(^|\.)instagram\.com$/.test(host) && /^\/p\//.test(url.pathname)) return "gallery";
  if (/(^|\.)reddit\.com$/.test(host) && /^\/gallery\//.test(url.pathname)) return "gallery";
  if (/(^|\.)(x|twitter)\.com$/.test(host) && /\/photo\//.test(url.pathname)) return "gallery";
  return "media";
}
