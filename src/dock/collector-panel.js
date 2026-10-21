import { dock as api, pickFolder } from "../api.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { S } from "./state.js";
import { persist } from "./config-sync.js";
import { collectorQueue, classifyLink, onDownloadChange } from "./collector.js";
import { pluginError } from "../plugin-errors.js";

const text = (tag, value, className = "") => { const el = document.createElement(tag); el.textContent = value; el.className = className; return el; };
export function buildCollectorPanel(item, { box, button, installButton, isDisposed, onDispose }) {
  box.append(text("p", t("refine.collectorIntro"), "collector-intro"));
  const preferences = document.createElement("details"); preferences.className = "collector-settings";
  const summary = text("summary", ""); summary.innerHTML = `${icon("settings")}<span></span>`;
  summary.querySelector("span").textContent = t("refine.collectorSettings"); preferences.append(summary);
  const folder = text("p", S.cfg.collectorDirectory || t("refine.systemDownloads"), "collector-folder");
  const save = async (patch) => { if (!(await persist(patch))) throw new Error(t("status.saveError")); Object.assign(S.cfg, patch); };
  button(preferences, t("m.addFolder"), async () => { const path = await pickFolder(); if (path) { await save({ collectorDirectory: path }); folder.textContent = path; } });
  button(preferences, t("refine.systemDownloads"), async () => { await save({ collectorDirectory: "" }); folder.textContent = t("refine.systemDownloads"); });
  preferences.append(folder);
  const defaultLabel = text("label", t("refine.defaultFormat"), "collector-field");
  const defaultFormat = document.createElement("select"); defaultFormat.setAttribute("aria-label", t("refine.defaultFormat"));
  for (const mode of ["video", "audio"]) defaultFormat.append(new Option(t(`dl.${mode}`), mode));
  defaultFormat.value = (S.cfg.collectorFormat === "audio" ? "audio" : "video");
  defaultFormat.addEventListener("change", async () => {
    defaultFormat.disabled = true;
    try { await save({ collectorFormat: defaultFormat.value }); }
    catch (_) { defaultFormat.value = (S.cfg.collectorFormat === "audio" ? "audio" : "video"); folder.textContent = t("status.saveError"); }
    finally { defaultFormat.disabled = false; }
  });
  defaultLabel.append(defaultFormat); preferences.append(defaultLabel); box.append(preferences);

  const form = document.createElement("div"); form.className = "download-form";
  const input = document.createElement("textarea"); input.rows = 3; input.maxLength = 40000; input.placeholder = t("dl.paste"); input.setAttribute("aria-label", t("dl.paste")); input.value = item.url || "";
  const label = text("label", t("refine.mode"), "collector-field");
  const mode = document.createElement("select"); mode.setAttribute("aria-label", t("refine.mode"));
  for (const [value, key] of [["auto", "refine.auto"], ["video", "dl.video"], ["audio", "dl.audio"], ["file", "refine.file"], ["gallery", "refine.gallery"]]) mode.append(new Option(t(key), value));
  label.append(mode);
  const error = text("p", "", "plugin-action-error"); error.setAttribute("role", "alert"); error.hidden = true;
  const add = async () => {
    const lines = input.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length || lines.length > 50) throw new Error(t(lines.length ? "refine.queueFull" : "perr.link"));
    const entries = lines.map((line) => {
      let url;
      try { url = new URL(line); } catch (_) { throw new Error(t("perr.link")); }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || line.length > 8192) throw new Error(t("perr.link"));
      const kind = classifyLink(url.href);
      return { url: url.href, directory: S.cfg.collectorDirectory || null, format: mode.value === "auto" ? (kind === "media" ? (S.cfg.collectorFormat === "audio" ? "audio" : "video") : kind) : mode.value };
    });
    try { collectorQueue.enqueue(entries); }
    catch (_) { throw new Error(t("refine.queueFull")); }
    error.hidden = true; input.value = "";
  };
  form.append(input, label, error);
  button(form, t("refine.addQueue"), add).classList.add("primary"); box.append(form);
  api.pluginStatus("yt-dlp").then((state) => {
    if (isDisposed() || state?.installed) return;
    const offer = text("div", "", "device-offer"); offer.append(text("span", t("dl.needs")));
    installButton(offer, t("dev.enable"), "yt-dlp", () => offer.remove()); box.insertBefore(offer, form);
  }).catch(() => {});

  const head = text("div", "", "collector-queue-head"); head.append(text("strong", t("refine.queue")));
  button(head, t("refine.clear"), () => collectorQueue.clear()); box.append(head);
  const list = document.createElement("div"); list.className = "collector-jobs"; box.append(list, text("small", t("refine.session"), "collector-session"));
  const rows = new Map();
  const draw = () => {
    if (isDisposed()) return;
    const jobs = collectorQueue.jobs;
    for (const [id, row] of rows) if (!jobs.some((job) => job.id === id)) { row.remove(); rows.delete(id); }
    for (const job of jobs) {
      let row = rows.get(job.id);
      if (!row) {
        row = text("article", "", "collector-job"); row.dataset.id = job.id;
        row.append(text("strong", "", "collector-job-title"), text("p", "", "collector-job-state"), text("div", "", "collector-job-actions"));
        list.append(row); rows.set(job.id, row);
      }
      let host = "";
      try { host = new URL(job.url).hostname; } catch (_) { /* already validated */ }
      row.querySelector("strong").textContent = job.title || job.path.split(/[\\/]/).pop() || host;
      const labelKey = { queued: "refine.queued", cancelled: "refine.cancelled", done: "dl.done", error: "dl.failed" }[job.state];
      row.querySelector("p").textContent = job.cancelRequested ? t("refine.cancelling") : job.state === "error" ? pluginError(job.error) : labelKey ? t(labelKey) : job.indeterminate ? "…" : `${Math.round(job.percent)}%`;
      if (row.dataset.state === job.state && row.dataset.cancelling === String(!!job.cancelRequested)) continue;
      row.dataset.state = job.state; row.dataset.cancelling = String(!!job.cancelRequested);
      const actions = row.querySelector(".collector-job-actions"); actions.replaceChildren();
      if (["queued", "start", "progress"].includes(job.state)) button(actions, t("refine.cancel"), () => collectorQueue.cancel(job.id)).disabled = !!job.cancelRequested;
      if (["error", "cancelled"].includes(job.state)) button(actions, t("focus.retry"), () => collectorQueue.retry(job.id));
      if (job.state === "done" && job.path) {
        button(actions, t("dl.open"), () => api.openLocation(job.path));
        button(actions, t("refine.openFile"), () => api.launch(job.path, []));
        button(actions, t("stack.copyPath"), () => api.copyText(job.path));
      }
    }
  };
  onDispose(onDownloadChange(draw)); draw();
  if (item.url && (item.autoStart || classifyLink(item.url) !== "media")) add().catch((failure) => { if (!isDisposed()) { error.textContent = String(failure); error.hidden = false; } });
  if (!item.url) requestAnimationFrame(() => { if (!isDisposed()) input.focus({ preventScroll: true }); });
}
