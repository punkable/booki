import { getSettings, saveSettings, toast, getMeta, saveMeta, getBookmarkTreeData, pushSyncSnapshot, pullSyncSnapshot, injectIcons } from "./shared.js";
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
  bindReset(settings);
}

function setInitialState(settings) {
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
}

function bindTabs() {
  document.querySelectorAll(".opt-tab").forEach(tab => {
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
    el.addEventListener("change", async () => {
      await saveSettings({ [key]: el.checked });
      if (key === "compactView" || key === "showHealthBadges") previewFromSettings();
      toast(t("toast.saved"));
    });
  }
}

async function previewFromSettings() {
  const s = await getSettings();
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
  previewFromSettings();
  document.querySelectorAll(".swatch").forEach(el => {
    el.addEventListener("click", async () => {
      document.querySelectorAll(".swatch").forEach(s => { s.classList.remove("is-active"); s.setAttribute("aria-checked", "false"); });
      el.classList.add("is-active");
      el.setAttribute("aria-checked", "true");
      const color = el.dataset.color;
      await saveSettings({ accentColor: color });
      document.documentElement.style.setProperty("--accent", color === "auto" ? "" : el.style.getPropertyValue("--swatch"));
      previewFromSettings();
      toast(t("toast.saved"));
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  });
}

function bindViews() {
  document.querySelectorAll(".view-option").forEach(el => {
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
    const data = await getBookmarkTreeData();
    const folders = data.folders.filter(f => f.id !== "0" && f.id !== "1");
    const meta = await getMeta();
    const colorNames = ["mint","sky","rose","lavender","peach","amber","teal","coral","indigo","lime"];
    const colorValues = ["#34d399","#38bdf8","#fb7185","#a78bfa","#fbbf24","#f59e0b","#2dd4bf","#f472b6","#6366f1","#84cc16"];

    container.innerHTML = folders.length
      ? folders.map(f => {
          const currentColor = meta.folderColorsById[f.id] || "mint";
          return `<div class="folder-color-row" data-id="${f.id}">
            <span class="folder-color-name">${esc(f.title)}</span>
            <div class="folder-color-picker" data-folder="${f.id}">
              ${colorNames.map((name, i) => `
                <span class="fcolor-dot ${currentColor === name ? 'is-active' : ''}" data-color="${name}" style="background:${colorValues[i]};" tabindex="0" role="radio" aria-checked="${currentColor === name}"></span>
              `).join("")}
            </div>
          </div>`;
        }).join("")
      : `<div class="folder-color-empty" data-i18n="settings.folders.empty">No folders found.</div>`;

    container.querySelectorAll(".fcolor-dot").forEach(dot => {
      dot.addEventListener("click", async () => {
        const folderId = dot.closest(".folder-color-picker").dataset.folder;
        const color = dot.dataset.color;
        dot.closest(".folder-color-picker").querySelectorAll(".fcolor-dot").forEach(d => { d.classList.remove("is-active"); d.setAttribute("aria-checked", "false"); });
        dot.classList.add("is-active");
        dot.setAttribute("aria-checked", "true");
        const meta = await getMeta();
        meta.folderColorsById[folderId] = color;
        await saveMeta(meta);
        toast("Folder color updated.");
      });
      dot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dot.click(); } });
    });
    applyI18n();
  } catch {
    container.innerHTML = `<div class="folder-color-empty">Could not load folders.</div>`;
  }
}

function bindSync() {
  const syncCodeOutput = document.getElementById("syncCodeOutput");
  const copyBtn = document.getElementById("copyCodeButton");
  const restoreInput = document.getElementById("restoreCodeInput");
  const restoreBtn = document.getElementById("restoreCodeButton");
  const importInput = document.getElementById("importFileInput");
  const dropZone = document.getElementById("importDropZone");

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
      const resp = await chrome.runtime.sendMessage({ type: "restore-from-code", code });
      if (resp?.ok) { toast(t("toast.imported")); restoreInput.value = ""; }
    } catch { toast("Invalid code.", "error"); }
  });

  document.getElementById("exportJsonButton")?.addEventListener("click", async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "export-booki" });
      if (resp?.ok) {
        const blob = new Blob([resp.json], { type: "application/json" });
        triggerDownload(blob, `booki-export-${Date.now()}.json`);
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
  document.getElementById("resetDefaultsButton")?.addEventListener("click", async () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    if (!confirm("Are you sure?")) return;
    await chrome.storage.local.remove("settings");
    toast("Settings reset. Reload the page.");
    refreshUI();
  });
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

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.version && data.app === "booki") {
        const resp = await chrome.runtime.sendMessage({ type: "restore-from-code", code: data });
        if (resp?.ok) toast(t("toast.imported"));
        else toast("Could not restore from file.", "error");
      } else {
        toast("Unrecognized file format.", "error");
      }
    } catch {
      toast("Could not parse file.", "error");
    }
  };
  reader.readAsText(file);
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
