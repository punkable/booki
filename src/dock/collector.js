/* Collector widget (yt-dlp, FFmpeg, gallery-dl): drop a link on the dock, pick Video or Audio
   only, and the card shows the progress; the panel shows the file when done.
   One download at a time; progress arrives as native events. */
import { dock as api, onDownloadEvent } from "../api.js";
import { t } from "../i18n.js";
import { eachWidget } from "./live-widgets.js";
import { setMetric, setText } from "./widget-view.js";
import { setTileLabel } from "./tooltip.js";
import { createDownloadQueue } from "./download-queue.js";
import { notify } from "./notices.js";

export const download = { state: "idle", percent: 0, title: "", path: "", error: "" };
const listeners = new Set();
const baseName = (path) => String(path || "").split(/[\\/]/).pop();
export const collectorQueue = createDownloadQueue({
  run: (job) => api.pluginDownload(job.url, job.directory, job.format, job.id),
  cancel: (id) => api.pluginCancelDownload(id),
  changed: (jobs, active) => {
    const latest = active || jobs.at(-1);
    Object.assign(download, latest || { state: "idle", percent: 0, title: "", path: "", error: "" });
    paintDownloads();
    for (const fn of listeners) { try { fn(download); } catch (_) { /* a closed panel */ } }
  },
  completed: (job) => notify(t("dl.done"), baseName(job.path), { actions: [
    { label: t("dl.open"), run: () => api.openLocation(job.path) },
    { label: t("refine.openFile"), run: () => api.launch(job.path, []) },
    { label: t("stack.copyPath"), run: () => api.copyText(job.path) },
  ] }).catch(() => {}),
});

export function paintDownloads() {
  eachWidget("collector", (el) => {
    el.dataset.state = download.state;
    if (download.state === "progress" || download.state === "start") {
      if (download.indeterminate) setText(el, t("w.collector"), "…");
      else setMetric(el, t("w.collector"), Math.round(download.percent));
      setTileLabel(el, `${download.title || t("w.collector")} · ${download.indeterminate ? "…" : `${Math.round(download.percent)}%`}`);
    } else if (download.state === "done") {
      setMetric(el, t("dl.done"), 100);
      setTileLabel(el, `${t("dl.done")} · ${baseName(download.path)}`);
    } else if (download.state === "error") {
      setText(el, t("w.collector"), "!");
      setTileLabel(el, [t("dl.failed"), download.error].filter(Boolean).join(" · "));
    } else {
      setText(el, t("w.collector"), "0");
      setTileLabel(el, t("dl.drop"));
    }
  });
}
export function onDownloadChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
onDownloadEvent((event) => collectorQueue.progress(event));

export function startDownload(url, format, directory = null) {
  return collectorQueue.enqueue([{ url, format, directory }])[0];
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
