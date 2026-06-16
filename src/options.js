import { applyAccentColor, getSettings, saveSettings, toast, getBookmarkTreeData, pushSyncSnapshot, pullSyncSnapshot, injectIcons, parseNetscapeBookmarks, getBackupState } from "./shared.js";
import { detectBrowserLanguage, setLanguage, t } from "./i18n.js";

init();

async function init() {
  refreshUI();
}

async function refreshUI() {
  injectIcons();
  const settings = await getSettings();
  const lang = settings.language || detectBrowserLanguage();
  setLanguage(lang);
  applyI18n();
  applyOptionsSettings(settings);
  setInitialState(settings);
  bindTabs();
  bindSettings(settings);
  bindColors(settings);
  bindViews();
  bindScope();
  bindLanguage();
  bindSearch();
  bindFolderColors(settings);
  bindSync();
  bindAutoBackup(settings);
  bindGist();
  bindReset(settings);
}

function bindGist() {
  const tokenInput = document.getElementById("githubToken");
  const gistIdInput = document.getElementById("githubGistId");
  const saveBtn = document.getElementById("saveGistButton");
  const pushBtn = document.getElementById("gistPushButton");
  const pullBtn = document.getElementById("gistPullButton");
  if (!saveBtn || saveBtn.dataset.bound) return;
  saveBtn.dataset.bound = "1";

  renderGistStatus();

  document.getElementById("connectGithubButton")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://github.com/settings/tokens/new?scopes=gist&description=Booki%20backup" });
    toast(t("gist.connectHint", "Generate the token on GitHub, then paste it below."));
  });

  saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    const gistId = gistIdInput.value.trim();
    const resp = await chrome.runtime.sendMessage({ type: "gist-save", token, gistId });
    if (resp?.ok) { tokenInput.value = ""; toast(t("toast.saved")); renderGistStatus(); }
    else toast(resp?.error || "Could not save.", "error");
  });

  pushBtn.addEventListener("click", async () => {
    pushBtn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "gist-push" });
      if (resp?.ok) { if (gistIdInput) gistIdInput.value = resp.gistId; toast(t("gist.pushed", "Backup pushed to Gist.")); renderGistStatus(); }
      else toast(resp?.error || "Push failed.", "error");
    } finally { pushBtn.disabled = false; }
  });

  pullBtn.addEventListener("click", async () => {
    pullBtn.disabled = true;
    try {
      const { importMode } = await getSettings();
      const preview = await chrome.runtime.sendMessage({ type: "gist-pull", mode: importMode, dryRun: true });
      if (!preview?.ok) { toast(preview?.error || "Pull failed.", "error"); return; }
      if (!confirm(previewMessage(preview.stats))) return;
      const resp = await chrome.runtime.sendMessage({ type: "gist-pull", mode: importMode });
      if (resp?.ok) { toast(summarizeRestore(resp.stats)); refreshUI(); }
      else toast(resp?.error || "Pull failed.", "error");
    } finally { pullBtn.disabled = false; }
  });
}

async function renderGistStatus() {
  const status = document.getElementById("gistStatus");
  const gistIdInput = document.getElementById("githubGistId");
  if (!status) return;
  const resp = await chrome.runtime.sendMessage({ type: "gist-status" });
  if (!resp?.ok) { status.textContent = ""; return; }
  if (gistIdInput && resp.gistId && !gistIdInput.value) gistIdInput.value = resp.gistId;
  if (!resp.hasToken) { status.textContent = t("gist.notoken", "No token saved yet."); return; }
  const when = resp.lastPushAt ? new Date(resp.lastPushAt).toLocaleString() : "never";
  status.textContent = `${t("gist.connected", "Token saved")} · ${t("gist.lastpush", "last push")}: ${when}`;
}

async function bindAutoBackup(settings) {
  const select = document.getElementById("autoBackupSelect");
  if (select) {
    select.value = settings.autoBackupInterval || "off";
    if (!select.dataset.bound) {
      select.dataset.bound = "1";
      select.addEventListener("change", async () => {
        await saveSettings({ autoBackupInterval: select.value });
        toast(t("toast.saved"));
        renderBackupStatus();
      });
    }
  }
  renderBackupStatus();
}

async function renderBackupStatus() {
  const status = document.getElementById("lastBackupStatus");
  if (!status) return;
  const state = await getBackupState();
  if (!state.lastBackupAt) {
    status.textContent = t("sync.backup.never", "No automatic backup yet.");
    return;
  }
  const days = Math.floor((Date.now() - state.lastBackupAt) / 86400000);
  const when = new Date(state.lastBackupAt).toLocaleDateString();
  status.textContent = `${t("sync.backup.last", "Last auto-backup")}: ${when} (${days}d).`;
}

function setInitialState(settings) {
  document.querySelectorAll(".swatch, .view-option, .chip, .lang-card").forEach(el => {
    el.classList.remove("is-active");
    el.setAttribute("aria-checked", "false");
  });
  document.querySelectorAll(`.swatch[data-color="${settings.accentColor}"]`).forEach(s => {
    s.classList.add("is-active"); s.setAttribute("aria-checked", "true");
  });
  document.querySelectorAll(`.view-option[data-view="${settings.defaultView}"]`).forEach(v => {
    v.classList.add("is-active"); v.setAttribute("aria-checked", "true");
  });
  document.querySelectorAll(`.chip[data-value="${settings.searchScope}"]`).forEach(c => {
    c.classList.add("is-active"); c.setAttribute("aria-checked", "true");
  });
  const lang = settings.language || detectBrowserLanguage();
  document.querySelectorAll(`.lang-card[data-lang="${lang}"]`).forEach(c => {
    c.classList.add("is-active"); c.setAttribute("aria-checked", "true");
  });
  const importMode = settings.importMode || "merge";
  document.querySelectorAll(".import-mode-option").forEach(b => {
    const active = b.dataset.mode === importMode;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-checked", String(active));
  });
}

function applyOptionsSettings(settings) {
  applyAccentColor(settings);
  previewFromSettings(settings);
}

function bindTabs() {
  document.querySelectorAll(".opt-tab").forEach(tab => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = "1";
    tab.addEventListener("click", () => {
      document.querySelectorAll(".opt-tab").forEach(t => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
      document.querySelectorAll(".opt-panel").forEach(p => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      const panel = document.querySelector(`.opt-panel[data-panel="${tab.dataset.tab}"]`);
      if (panel) panel.classList.add("is-active");
    });
  });
}

function bindSettings(settings) {
  const checkboxes = [
    "openInNewTab", "openInTab", "focusSearch", "autoTagOnSave",
    "confirmDelete", "compactView", "showHealthBadges", "rememberView", "deadLinkBadge"
  ];
  for (const key of checkboxes) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.checked = !!settings[key];
    if (el.dataset.bound) continue;
    el.dataset.bound = "1";
    el.addEventListener("change", async () => {
      const next = await saveAndReadSettings({ [key]: el.checked });
      applyOptionsSettings(next);
      toast(t("toast.saved"));
    });
  }
}

async function previewFromSettings(settings) {
  const s = settings || await getSettings();
  const pane = document.getElementById("previewPane");
  if (!pane) return;
  pane.querySelectorAll(".preview-bookmark").forEach(bm => {
    bm.classList.toggle("is-compact", !!s.compactView);
    const health = bm.querySelector(".preview-health");
    const dot = bm.querySelector(".preview-dot");
    if (health) health.style.display = s.showHealthBadges ? "" : "none";
    if (dot) dot.style.display = s.showHealthBadges ? "none" : "";
  });
}

function bindColors(settings) {
  previewFromSettings(settings);
  document.querySelectorAll(".swatch").forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", async () => {
      document.querySelectorAll(".swatch").forEach(s => { s.classList.remove("is-active"); s.setAttribute("aria-checked", "false"); });
      el.classList.add("is-active");
      el.setAttribute("aria-checked", "true");
      const color = el.dataset.color;
      const next = await saveAndReadSettings({ accentColor: color });
      applyOptionsSettings(next);
      toast(t("toast.saved"));
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  });
}

function bindViews() {
  document.querySelectorAll(".view-option").forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", async () => {
      document.querySelectorAll(".view-option").forEach(v => { v.classList.remove("is-active"); v.setAttribute("aria-checked", "false"); });
      el.classList.add("is-active");
      el.setAttribute("aria-checked", "true");
      await saveSettings({ defaultView: el.dataset.view });
      toast(t("toast.saved"));
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  });
}

function bindScope() {
  document.querySelectorAll(".chip").forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", async () => {
      document.querySelectorAll(".chip").forEach(c => { c.classList.remove("is-active"); c.setAttribute("aria-checked", "false"); });
      el.classList.add("is-active");
      el.setAttribute("aria-checked", "true");
      await saveSettings({ searchScope: el.dataset.value });
      toast(t("toast.saved"));
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  });
}

function bindLanguage() {
  document.querySelectorAll(".lang-card").forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", async () => {
      document.querySelectorAll(".lang-card").forEach(c => { c.classList.remove("is-active"); c.setAttribute("aria-checked", "false"); });
      el.classList.add("is-active");
      el.setAttribute("aria-checked", "true");
      const lang = el.dataset.lang;
      await saveSettings({ language: lang });
      setLanguage(lang);
      localStorage.setItem("booki-lang", lang);
      applyI18n();
      toast(t("toast.saved") + " " + t("settings.language.reload"));
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  });
}

function bindSearch() {
  const input = document.getElementById("settingsSearch");
  if (!input) return;
  if (input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll(".opt-panel").forEach(panel => {
      const text = panel.textContent.toLowerCase();
      const visible = !q || text.includes(q);
      panel.style.display = visible ? "" : "none";
    });
    document.querySelectorAll(".opt-tab").forEach(tab => {
      const text = tab.textContent.toLowerCase();
      const visible = !q || text.includes(q);
      tab.style.display = visible ? "" : "none";
    });
  });
}

async function bindFolderColors() {
  const container = document.getElementById("folderColorList");
  try {
    await getBookmarkTreeData();
    container.innerHTML = `<div class="folder-color-empty" data-i18n="settings.folders.direct">Open Folders, then click a folder icon to choose a color or emoji.</div>`;
    applyI18n();
  } catch {
    container.innerHTML = `<div class="folder-color-empty">Could not load folders.</div>`;
  }
}

function bindSync() {
  const syncRoot = document.querySelector("[data-panel='sync']");
  if (syncRoot?.dataset.bound) return;
  if (syncRoot) syncRoot.dataset.bound = "1";
  const syncCodeOutput = document.getElementById("syncCodeOutput");
  const copyBtn = document.getElementById("copyCodeButton");
  const restoreInput = document.getElementById("restoreCodeInput");
  const restoreBtn = document.getElementById("restoreCodeButton");
  const importInput = document.getElementById("importFileInput");
  const dropZone = document.getElementById("importDropZone");

  document.querySelectorAll(".import-mode-option").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".import-mode-option").forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-checked", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-checked", "true");
      await saveSettings({ importMode: btn.dataset.mode });
    });
  });

  document.getElementById("genCodeButton")?.addEventListener("click", async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: "generate-sync-code" });
      if (result?.ok && result.code) {
        syncCodeOutput.value = result.code;
        toast(t("toast.code.generated"));
      }
    } catch { toast("Could not generate code.", "error"); }
  });

  copyBtn?.addEventListener("click", () => {
    if (syncCodeOutput.value) {
      navigator.clipboard.writeText(syncCodeOutput.value).then(() => toast(t("toast.code.copied")));
    }
  });

  restoreBtn?.addEventListener("click", async () => {
    const code = restoreInput.value.trim();
    if (!code) return;
    try {
      const { importMode } = await getSettings();
      const resp = await chrome.runtime.sendMessage({ type: "restore-from-code", code, mode: importMode });
      if (resp?.ok) { toast(summarizeRestore(resp.stats)); restoreInput.value = ""; refreshUI(); }
      else toast(resp?.error || "Invalid code.", "error");
    } catch { toast("Invalid code.", "error"); }
  });

  document.getElementById("exportJsonButton")?.addEventListener("click", async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "export-booki" });
      if (resp?.ok) {
        const blob = new Blob([resp.json], { type: "application/json" });
        triggerDownload(blob, resp.filename || `booki-backup-${Date.now()}.json`);
        toast(t("toast.exported"));
      }
    } catch { toast("Export failed.", "error"); }
  });

  document.getElementById("exportHtmlButton")?.addEventListener("click", async () => {
    try {
      const data = await getBookmarkTreeData();
      const html = buildExportHtml(data);
      const blob = new Blob([html], { type: "text/html" });
      triggerDownload(blob, `booki-export-${Date.now()}.html`);
      toast(t("toast.exported"));
    } catch { toast("Export failed.", "error"); }
  });

  dropZone?.addEventListener("click", () => importInput?.click());
  dropZone?.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("is-drag"); });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("is-drag"));
  dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("is-drag");
    if (e.dataTransfer.files.length) handleImportFile(e.dataTransfer.files[0]);
  });
  importInput?.addEventListener("change", () => {
    if (importInput.files.length) handleImportFile(importInput.files[0]);
  });

  document.getElementById("pushSyncButton")?.addEventListener("click", async () => {
    try {
      await pushSyncSnapshot();
      const st = document.getElementById("syncStatus");
      if (st) st.textContent = "Pushed at " + new Date().toLocaleTimeString();
      toast(t("toast.cloud.pushed"));
    } catch { toast("Push failed.", "error"); }
  });

  document.getElementById("pullSyncButton")?.addEventListener("click", async () => {
    try {
      const result = await pullSyncSnapshot();
      if (result) {
        toast(t("toast.cloud.pulled"));
        refreshUI();
      } else {
        toast("No snapshot found.", "error");
      }
    } catch { toast("Pull failed.", "error"); }
  });
}

function bindReset(settings) {
  const button = document.getElementById("resetDefaultsButton");
  if (!button || button.dataset.bound) return;
  button.dataset.bound = "1";
  button.addEventListener("click", async () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    if (!confirm("Are you sure?")) return;
    await chrome.storage.local.remove("settings");
    toast("Settings reset. Reload the page.");
    refreshUI();
  });
}

async function saveAndReadSettings(partial) {
  await saveSettings(partial);
  return getSettings();
}

function buildExportHtml(data) {
  const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>\n`;
  const rootChildren = data.bookmarks.filter(b => b.parentId === "1");
  const folderChildren = (id) => data.bookmarks.filter(b => b.parentId === id);
  const renderFolder = (f) => {
    html += `    <DT><H3>${esc(f.title)}</H3>\n    <DL><p>\n`;
    folderChildren(f.id).forEach(b => {
      html += `      <DT><A HREF="${esc(b.url)}" ADD_DATE="${Math.floor((b.dateAdded||Date.now())/1000)}">${esc(b.title)}</A>\n`;
    });
    data.folders.filter(sub => sub.parentId === f.id && sub.id !== f.id).forEach(renderFolder);
    html += `    </DL><p>\n`;
  };
  rootChildren.forEach(b => {
    html += `  <DT><A HREF="${esc(b.url)}" ADD_DATE="${Math.floor((b.dateAdded||Date.now())/1000)}">${esc(b.title)}</A>\n`;
  });
  data.folders.filter(f => f.parentId === "1").forEach(renderFolder);
  html += `</DL><p>\n`;
  return html;
}

async function handleImportFile(file) {
  try {
    const text = await file.text();
    let payload = null;
    if (file.name.toLowerCase().endsWith(".html") || /<dl/i.test(text)) {
      payload = parseNetscapeBookmarks(text);
    } else {
      const data = JSON.parse(text);
      if (data.version && data.app === "booki") payload = data;
    }
    if (!payload) { toast("Unrecognized file format.", "error"); return; }

    const { importMode } = await getSettings();
    const preview = await chrome.runtime.sendMessage({ type: "restore-from-file", payload, mode: importMode, dryRun: true });
    if (!preview?.ok) { toast(preview?.error || "Could not read file.", "error"); return; }
    if (!confirm(previewMessage(preview.stats))) return;

    const resp = await chrome.runtime.sendMessage({ type: "restore-from-file", payload, mode: importMode });
    if (resp?.ok) { toast(summarizeRestore(resp.stats)); refreshUI(); }
    else toast(resp?.error || "Could not restore from file.", "error");
  } catch {
    toast("Could not parse file.", "error");
  }
}

function previewMessage(stats) {
  const add = stats?.bookmarksCreated ?? 0;
  const skip = stats?.bookmarksSkipped ?? 0;
  const folders = stats?.foldersCreated ?? 0;
  const where = stats?.mode === "booki-folder" ? " inside a “Booki” folder" : "";
  return `Import preview:\n\n• ${add} new bookmark(s)${where}\n• ${skip} already present (skipped)\n• ${folders} new folder(s)\n\nApply now?`;
}

function summarizeRestore(stats) {
  if (!stats) return t("toast.imported");
  const added = stats.bookmarksCreated ?? 0;
  const skipped = stats.bookmarksSkipped ?? 0;
  const where = stats.mode === "booki-folder" ? " into the Booki folder" : "";
  if (!added && skipped) return `Already up to date — ${skipped} already present${where}.`;
  return `Imported ${added} new bookmark${added === 1 ? "" : "s"}${where}${skipped ? `, ${skipped} already present` : ""}.`;
}

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const text = t(key);
    if (text !== key) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    }
  });
}

function esc(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
