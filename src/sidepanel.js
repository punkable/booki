import {
  applyPortableMeta,
  applyAccentColor,
  createBookmark, createFolder, faviconUrl, formatDate, getBookmarkTreeData,
  getCurrentTab, injectIcons, getSettings, moveBookmark,
  normalizeTags, pullSyncSnapshot, pushSyncSnapshot, removeBookmarkMeta,
  setCategory, setFolderColor, setFolderEmoji, setTags, toast, toggleStar, updateFolder,
  buildTermIndex, suggestTags, findDuplicates, computeHealth,
  savePageContent, getPageContent
} from "./shared.js";
import { detectBrowserLanguage, setLanguage, t } from "./i18n.js";

injectIcons();

const FOLDER_COLORS = [
  { id: "mint", label: "Focus" },
  { id: "blue", label: "Work" },
  { id: "rose", label: "Ideas" },
  { id: "amber", label: "Read" },
  { id: "violet", label: "Build" },
  { id: "graphite", label: "Archive" }
];

const FOLDER_EMOJIS = ["📚", "🧠", "💼", "⭐", "🎨", "🛒", "💰", "🎬", "🔖", "🚀", "🧪", "🧭"];

const RECENT_WINDOW_DAYS = 30;

const CATEGORIES = [
  { id: "work", label: "Work", color: "blue", keywords: ["docs", "github", "jira", "slack", "notion", "workspace", "dashboard", "admin", "project", "client", "crm", "figma"] },
  { id: "research", label: "Research", color: "violet", keywords: ["paper", "research", "study", "docs", "developer", "reference", "guide", "manual", "learn", "course", "wiki"] },
  { id: "reading", label: "Reading", color: "mint", keywords: ["blog", "article", "newsletter", "medium", "substack", "news", "journal", "read", "story"] },
  { id: "shopping", label: "Shopping", color: "amber", keywords: ["shop", "store", "cart", "product", "amazon", "mercado", "etsy", "price", "checkout"] },
  { id: "finance", label: "Finance", color: "graphite", keywords: ["bank", "invoice", "billing", "stripe", "paypal", "finance", "tax", "accounting", "wallet"] },
  { id: "media", label: "Media", color: "rose", keywords: ["youtube", "video", "music", "podcast", "image", "photo", "gallery", "stream", "canva"] }
];

const state = {
  bookmarks: [], folders: [], filter: "all", folderFilter: "", query: "",
  settings: null, editingFolderId: "", stylingFolderId: "",
  selectedBookmarkId: "", organizeSuggestions: [], composerOpen: false,
  previewBookmark: null, dragId: ""
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const el = {
  search: $("#searchInput"),
  list: $("#bookmarkList"),
  empty: $("#emptyState"),
  badge: $("#bookmarkBadge"),
  onboardingCard: $("#onboardingCard"),
  onboardingRefresh: $("#onboardingRefresh"),
  onboardingImport: $("#onboardingImport"),
  folderFilterBadge: $("#folderFilterBadge"),
  folderSelect: $("#folderSelect"),
  importFile: $("#importFile"),
  importSummary: $("#importSummary"),
  dropZone: $("#dropZone"),
  folderList: $("#folderList"),
  clearFolderFilter: $("#clearFolderFilter"),
  form: $("#bookmarkForm"),
  title: $("#titleInput"),
  url: $("#urlInput"),
  tagsInput: $("#tagsInput"),
  folderDialog: $("#folderDialog"),
  folderForm: $("#folderForm"),
  folderName: $("#folderNameInput"),
  editFolderDialog: $("#editFolderDialog"),
  editFolderForm: $("#editFolderForm"),
  editFolderName: $("#editFolderNameInput"),
  folderStylePopover: $("#folderStylePopover"),
  composerPanel: $("#composerPanel"),
  composerToggle: $("#composerToggle"),
  panels: $$(".view-panel"),
  viewTabs: $$(".view-tab"),
  categoryGrid: $("#categoryGrid"),
  analyzeButton: $("#analyzeButton"),
  previewOrganizeButton: $("#previewOrganizeButton"),
  applyOrganizeButton: $("#applyOrganizeButton"),
  organizePreview: $("#organizePreview"),
  exportHtmlButton: $("#exportHtmlButton"),
  exportJsonButton: $("#exportJsonButton"),
  pushSyncButton: $("#pushSyncButton"),
  pushSyncButton2: $("#pushSyncButton2"),
  pullSyncButton: $("#pullSyncButton"),
  syncSummary: $("#syncSummary"),
  cloudSyncSummary: $("#cloudSyncSummary"),
  generateSyncCode: $("#generateSyncCode"),
  syncCodeInput: $("#syncCodeInput"),
  copySyncCode: $("#copySyncCode"),
  restoreSyncCode: $("#restoreSyncCode"),
  restoreFromCode: $("#restoreFromCode"),
  qrContainer: $("#qrContainer"),
  stepDots: $$(".step-dot"),
  stepPanels: $$(".step-panel"),
  previewPanel: $("#previewPanel"),
  previewClose: $("#previewClose"),
  previewFolderMove: $("#previewFolderMove"),
  readerPanel: $("#readerPanel"),
  readerClose: $("#readerClose")
};

init();

async function init() {
  state.settings = await getSettings();
  const s = state.settings;
  const lang = s.language || detectBrowserLanguage();
  setLanguage(lang);
  applySettings();
  bindEvents();
  enableDragScroll();
  const savedView = s.rememberView && localStorage.getItem("booki-last-view");
  const initialView = savedView && ["library","folders","organize","tools"].includes(savedView) ? savedView : s.defaultView;
  switchView(initialView);
  await loadLibrary();
  const urlParams = new URLSearchParams(location.search);
  const queryParam = urlParams.get("q");
  if (queryParam) {
    el.search.value = queryParam;
    state.query = queryParam.toLowerCase();
    renderBookmarks();
  }
  if (s.focusSearch && !queryParam) el.search.focus();
  else if (queryParam) el.search.focus();
  chrome.runtime.onMessage.addListener(onBackgroundMessage);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings?.newValue) {
      state.settings = { ...state.settings, ...changes.settings.newValue };
      applySettings();
      renderBookmarks();
    }
  });
}

function applySettings() {
  const s = state.settings;
  document.documentElement.classList.toggle("is-compact", !!s.compactView);
  document.documentElement.classList.toggle("show-health", !!s.showHealthBadges);
  applyAccentColor(s);
}

function onBackgroundMessage(msg) {
  if (msg?.type === "bookmarks-changed") loadLibrary();
  if (msg?.type === "settings-changed" || msg?.type === "settings-changed-broadcast") {
    Promise.resolve(msg.settings || getSettings()).then(s => { state.settings = s; applySettings(); });
  }
}

function bindEvents() {
  el.composerToggle.addEventListener("click", toggleComposer);
  el.search.addEventListener("input", () => {
    state.query = el.search.value.trim().toLowerCase();
    closePreview();
    renderBookmarks();
  });

  $$(".segment").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter || "all"));
  });

  $("#refreshButton").addEventListener("click", loadLibrary);
  el.onboardingRefresh?.addEventListener("click", loadLibrary);
  el.onboardingImport?.addEventListener("click", () => {
    switchView("tools");
    el.importFile?.click();
  });
  $("#fillCurrentTab").addEventListener("click", fillCurrentTab);
  $("#newFolderButton").addEventListener("click", () => el.folderDialog.showModal());
  $("#cancelFolder").addEventListener("click", () => el.folderDialog.close());
  $("#cancelEditFolder").addEventListener("click", () => el.editFolderDialog.close());
  el.clearFolderFilter.addEventListener("click", () => {
    state.folderFilter = "";
    if (el.folderFilterBadge) el.folderFilterBadge.textContent = "";
    el.clearFolderFilter.hidden = true;
    renderFolders();
    renderBookmarks();
  });
  el.folderList.addEventListener("click", handleFolderClick);
  el.folderStylePopover?.addEventListener("click", handleFolderStyleClick);
  document.addEventListener("click", (e) => {
    if (el.folderStylePopover?.hidden) return;
    if (e.target.closest("#folderStylePopover") || e.target.closest("[data-action='style-folder']")) return;
    closeFolderStylePopover();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFolderStylePopover();
  });
  el.form.addEventListener("submit", saveBookmarkFromForm);
  el.folderForm.addEventListener("submit", saveFolder);
  el.editFolderForm.addEventListener("submit", saveFolderEdits);
  el.viewTabs.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  el.analyzeButton.addEventListener("click", analyzeLibrary);
  el.previewOrganizeButton.addEventListener("click", renderOrganizePreview);
  el.applyOrganizeButton.addEventListener("click", applyOrganizePreview);
  $("#findDupesButton")?.addEventListener("click", findAndShowDuplicates);
  $("#checkDeadButton")?.addEventListener("click", runDeadLinkCheck);
  el.exportHtmlButton.addEventListener("click", exportBookmarksHtml);
  el.exportJsonButton.addEventListener("click", exportBookmarksJson);
  el.pushSyncButton?.addEventListener("click", pushSync);
  el.pushSyncButton2?.addEventListener("click", pushSync);
  el.pullSyncButton.addEventListener("click", pullSync);
  el.stepDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const step = parseInt(dot.dataset.step);
      el.stepDots.forEach((d) => d.classList.toggle("is-active", parseInt(d.dataset.step) === step));
      el.stepPanels.forEach((p) => { p.hidden = parseInt(p.dataset.step) !== step; });
    });
  });
  el.generateSyncCode.addEventListener("click", handleGenerateSyncCode);
  el.copySyncCode.addEventListener("click", handleCopySyncCode);
  el.restoreFromCode.addEventListener("click", handleRestoreFromCode);
  el.importFile.addEventListener("change", importFromFileInput);
  el.dropZone.addEventListener("dragover", (e) => { e.preventDefault(); el.dropZone.classList.add("is-dragging"); });
  el.dropZone.addEventListener("dragleave", () => el.dropZone.classList.remove("is-dragging"));
  el.dropZone.addEventListener("drop", handleImportDrop);
  el.list.addEventListener("click", handleListClick);
  el.list.addEventListener("change", handleListChange);
  el.list.addEventListener("dragstart", handleBookmarkDragStart);
  el.list.addEventListener("dragend", clearDragState);
  el.list.addEventListener("dragover", handleDragOver);
  el.list.addEventListener("drop", handleDrop);
  el.folderList.addEventListener("dragover", handleFolderDragOver);
  el.folderList.addEventListener("dragleave", handleFolderDragLeave);
  el.folderList.addEventListener("drop", handleFolderDrop);
  if (el.previewClose) el.previewClose.addEventListener("click", closePreview);
  const previewPanel = $("#previewPanel");
  if (previewPanel) {
    previewPanel.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn || !state.previewBookmark) return;
      const action = btn.dataset.action;
      if (action === "open") await openBookmark(state.previewBookmark);
      if (action === "star") {
        const starred = await toggleStar(state.previewBookmark.id);
        state.previewBookmark.starred = starred;
        state.bookmarks.find((b) => b.id === state.previewBookmark.id).starred = starred;
        showPreview(state.previewBookmark);
        renderBookmarks();
      }
      if (action === "delete") { await deleteBookmark(state.previewBookmark); closePreview(); }
      if (action === "edit") {
        el.title.value = state.previewBookmark.title;
        el.url.value = state.previewBookmark.url;
        el.tagsInput.value = (state.previewBookmark.tags || []).join(", ");
        closePreview();
        state.composerOpen = true;
        el.composerPanel.hidden = false;
        el.title.focus();
      }
      if (action === "auto-tag") {
        const index = buildTermIndex(state.bookmarks);
        const tags = suggestTags(state.previewBookmark, index);
        if (tags.length) {
          await setTags(state.previewBookmark.id, tags);
          state.previewBookmark.tags = tags;
          state.bookmarks.find((b) => b.id === state.previewBookmark.id).tags = tags;
          showPreview(state.previewBookmark);
          renderBookmarks();
          toast(`Tags added: ${tags.join(", ")}`);
        } else {
          toast("Could not suggest tags for this bookmark.", "error");
        }
      }
      if (action === "capture") {
        toast("Capturing page content...");
        const resp = await chrome.runtime.sendMessage({ type: "capture-content", url: state.previewBookmark.url });
        if (resp?.ok && resp.content) {
          await savePageContent(state.previewBookmark.id, resp.content);
          toast("Content captured. Open reader to view.");
        } else {
          toast("Could not capture page content.", "error");
        }
      }
      if (action === "reader" && state.previewBookmark) {
        const content = await getPageContent(state.previewBookmark.id);
        if (content) {
          const reader = el.readerPanel;
          if (reader) {
            reader.querySelector("#readerTitle").textContent = state.previewBookmark.title;
            reader.querySelector("#readerBody").textContent = content;
            reader.hidden = false;
          }
        } else {
          toast("No captured content. Use Capture first.", "error");
        }
      }
    });
    previewPanel.addEventListener("change", async (e) => {
      if (e.target.id === "previewTags" && state.previewBookmark) {
        const tags = normalizeTags(e.target.value);
        await setTags(state.previewBookmark.id, tags);
        state.previewBookmark.tags = tags;
        state.bookmarks.find((b) => b.id === state.previewBookmark.id).tags = tags;
        renderBookmarks();
        toast("Tags updated.");
      }
      if (e.target.id === "previewFolderMove" && state.previewBookmark) {
        await moveBookmark(state.previewBookmark.id, e.target.value);
        toast("Moved.");
        await loadLibrary();
        const moved = state.bookmarks.find((b) => b.id === state.previewBookmark?.id);
        if (moved) showPreview(moved);
      }
    });
  }
  if (el.readerClose) el.readerClose.addEventListener("click", () => { el.readerPanel.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePreview(); el.readerPanel.hidden = true; }
  });
}

function enableDragScroll() {
  let dragging = false;
  let startY = 0;
  let startScroll = 0;
  document.addEventListener("mousedown", (e) => {
    if (!document.body.classList.contains("panel-shell")) return;
    if (e.button !== 0) return;
    if (e.target.closest("button, input, select, textarea, a, dialog, .bookmark-item, .folder-bookmark, .folder-item, [draggable='true']")) return;
    dragging = true;
    startY = e.clientY;
    startScroll = window.scrollY;
    document.body.classList.add("is-drag-scrolling");
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    e.preventDefault();
    window.scrollTo(0, startScroll + (startY - e.clientY));
  });
  document.addEventListener("mouseup", () => {
    dragging = false;
    document.body.classList.remove("is-drag-scrolling");
  });
}

/* ─── Preview panel ─── */

function showPreview(bookmark) {
  state.previewBookmark = bookmark;
  if (!el.previewPanel) return;
  const p = el.previewPanel;
  const domain = safeUrl(bookmark.url)?.hostname || "";

  const list = document.querySelector(".view-panel[data-panel='library']");
  if (list) list.style.display = "none";
  p.hidden = false;

  p.querySelector("#previewFavicon").src = faviconUrl(bookmark.url, 64);
  p.querySelector("#previewTitle").textContent = bookmark.title;
  p.querySelector("#previewUrl").textContent = bookmark.url;
  p.querySelector("#previewUrl").href = bookmark.url;
  p.querySelector("#previewDomain").textContent = domain;
  p.querySelector("#previewDomain").style.color = `var(--folder-${findFolderColor(bookmark.parentId)})`;

  const folderEl = p.querySelector("#previewFolder");
  folderEl.innerHTML = `<span class="svg-icon" data-icon="folder" style="width:14px;height:14px;vertical-align:text-bottom;" aria-hidden="true"></span> ${esc(findFolderName(bookmark.parentId))}`;
  p.querySelector("#previewDate").textContent = formatDate(bookmark.dateAdded);
  p.querySelector("#previewTags").value = (bookmark.tags || []).join(", ");
  p.querySelector("#previewTags").dataset.bookmarkId = bookmark.id;
  const moveSelect = p.querySelector("#previewFolderMove");
  if (moveSelect) {
    moveSelect.innerHTML = state.folders
      .map((f) => `<option value="${esc(f.id)}"${f.id === bookmark.parentId ? " selected" : ""}>${esc(f.path || f.title)}</option>`)
      .join("");
  }

  const health = bookmark.health || { score: 50, level: "ok" };
  const healthEl = p.querySelector("#previewHealth");
  healthEl.textContent = `${health.score}/100`;
  healthEl.className = "health-badge";
  healthEl.style.background = health.level === "great" ? "var(--success-soft)" : health.level === "poor" ? "var(--danger-soft)" : "var(--accent-soft)";
  healthEl.style.color = health.level === "great" ? "var(--success)" : health.level === "poor" ? "var(--danger)" : "var(--accent)";

  const deadEl = p.querySelector("#previewDead");
  deadEl.hidden = !(bookmark.dead?.ok === false);

  p.querySelectorAll("[data-action]").forEach((button) => {
    button.dataset.bookmarkId = bookmark.id;
  });
  const starBtn = p.querySelector("[data-action='star']");
  if (starBtn) {
    starBtn.classList.toggle("is-active", !!bookmark.starred);
    starBtn.innerHTML = `<span class="svg-icon" data-icon="star" style="${bookmark.starred ? 'color:var(--amber-gold);fill:var(--amber-gold);' : ''}" aria-hidden="true"></span> ${bookmark.starred ? "Unstar" : "Star"}`;
  }
  injectIcons();
}

function closePreview() {
  state.previewBookmark = null;
  if (el.previewPanel) el.previewPanel.hidden = true;
  if (el.readerPanel) el.readerPanel.hidden = true;
  const list = document.querySelector(".view-panel[data-panel='library']:not(#composerPanel)");
  if (list) list.style.display = "";
}

function findFolderName(folderId) {
  return state.folders.find((f) => f.id === folderId)?.title || "Bookmarks";
}

function findFolderColor(folderId) {
  return state.folders.find((f) => f.id === folderId)?.color || "mint";
}

function toggleComposer() {
  state.composerOpen = !state.composerOpen;
  el.composerPanel.hidden = !state.composerOpen;
  if (state.composerOpen) { closePreview(); el.previewPanel.hidden = true; fillCurrentTab(); el.title.focus(); }
}

async function loadLibrary() {
  el.list.setAttribute("aria-busy", "true");
  try {
    const data = await getBookmarkTreeData();
    /* Preserve each bookmark's natural position within its folder (the order
       Chrome returns) so manual drag-to-reorder is visible and persists. The
       Recent / Starred filters re-sort by date in filteredBookmarks(). */
    data.bookmarks.forEach((b, i) => { b.ord = i; });
    state.bookmarks = data.bookmarks.sort((a, b) => folderSort(a, b) || (a.ord - b.ord));
    state.folders = data.folders.filter((f) => f.id !== "0");
    updateBadge();
    renderOnboarding();
    renderFolderSelects();
    renderFolders();
    renderFilterTabs();
    renderBookmarks();
    renderCategories();
  } catch (e) {
    toast(e.message || "Could not load bookmarks.", "error");
  } finally {
    el.list.removeAttribute("aria-busy");
  }
}

function updateBadge() { el.badge.textContent = ` ${state.bookmarks.length}`; }

function setFilter(filter) {
  state.filter = ["all", "starred", "recent"].includes(filter) ? filter : "all";
  closePreview();
  renderFilterTabs();
  renderBookmarks();
}

function renderFilterTabs() {
  const stats = getFilterStats();
  $$(".segment").forEach((btn) => {
    const active = btn.dataset.filter === state.filter;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
    const count = btn.querySelector(".segment-count");
    if (count) count.textContent = String(stats[btn.dataset.filter] ?? 0);
  });
}

function getFilterStats() {
  const now = Date.now();
  return state.bookmarks.reduce((stats, bookmark) => {
    stats.all += 1;
    if (bookmark.starred) stats.starred += 1;
    if (isRecentBookmark(bookmark, now)) stats.recent += 1;
    return stats;
  }, { all: 0, starred: 0, recent: 0 });
}

function renderOnboarding() {
  if (!el.onboardingCard) return;
  const seen = localStorage.getItem("booki-onboarding-seen") === "1";
  const shouldShow = !seen || state.bookmarks.length === 0;
  el.onboardingCard.hidden = !shouldShow;
  if (state.bookmarks.length > 0) localStorage.setItem("booki-onboarding-seen", "1");
  injectIcons();
}

function switchView(view) {
  closePreview();
  el.readerPanel.hidden = true;
  el.viewTabs.forEach((t) => {
    t.classList.toggle("is-active", t.dataset.view === view);
    t.style.setProperty("--section-accent", state.settings.accentColor === "auto" ? "var(--brand-gold)" : "var(--accent)");
  });
  const activeTab = el.viewTabs.find((t) => t.dataset.view === view);
  if (activeTab) {
    const accentMap = { folders: "var(--blue-violet)", organize: "var(--azure-blue)", tools: "var(--neon-pink)" };
    activeTab.style.setProperty("--section-accent", state.settings.accentColor === "auto" ? (accentMap[view] || "var(--brand-gold)") : "var(--accent)");
  }
  el.panels.forEach((p) => { p.hidden = p.dataset.panel !== view; });
  if (view === "library" && !state.composerOpen) el.composerPanel.hidden = true;
  if (view !== "library") { el.composerPanel.hidden = true; state.composerOpen = false; }
  if (view === "tools") {
    el.stepDots.forEach((d) => d.classList.toggle("is-active", parseInt(d.dataset.step) === 0));
    el.stepPanels.forEach((p) => { p.hidden = parseInt(p.dataset.step) !== 0; });
  }
  if (state.settings.rememberView) localStorage.setItem("booki-last-view", view);
}

function renderFolderSelects() {
  const opts = state.folders.map((f) => `<option value="${esc(f.id)}">${esc(f.path || f.title)}</option>`).join("");
  el.folderSelect.innerHTML = opts || '<option value="1">Bookmarks bar</option>';
}

function renderFolders() {
  const sorted = [...state.folders].sort((a, b) => (a.path || a.title).localeCompare(b.path || b.title));
  el.folderList.innerHTML = sorted.map(renderFolderItem).join("");
  injectIcons();
  attachFolderBmEvents();
  if (el.clearFolderFilter) el.clearFolderFilter.hidden = !state.folderFilter;
}

function renderFolderItem(folder) {
  const active = state.folderFilter === folder.id ? " expanded" : "";
  const bookmarkCount = state.bookmarks.filter(b => b.parentId === folder.id).length;
  const color = FOLDER_COLORS.some((c) => c.id === folder.color) ? folder.color : "mint";
  const folderIcon = folder.emoji
    ? `<span class="folder-avatar-emoji" aria-hidden="true">${esc(folder.emoji)}</span>`
    : `<span class="svg-icon" data-icon="folder" aria-hidden="true"></span>`;
  return `
    <article class="folder-item${active}" data-folder-id="${esc(folder.id)}" style="--folder-color:var(--folder-${esc(color)});">
      <div class="folder-item-info" data-action="open-folder">
        <button class="folder-avatar" type="button" data-action="style-folder" title="Style folder" aria-label="Style ${esc(folder.title)}">
          ${folderIcon}
        </button>
        <span class="folder-item-title">${esc(folder.title)}</span>
        <span class="folder-item-count">${bookmarkCount}</span>
      </div>
      <div class="folder-actions">
        <button class="icon-button" type="button" data-action="edit-folder" title="Edit" aria-label="Edit folder" style="width:26px;height:26px;">
          <span class="svg-icon" data-icon="edit" style="width:14px;height:14px;" aria-hidden="true"></span>
        </button>
        <button class="icon-button" type="button" data-action="filter-folder" title="Show in library" aria-label="Show in library" style="width:26px;height:26px;">
          <span class="svg-icon" data-icon="search" style="width:14px;height:14px;" aria-hidden="true"></span>
        </button>
      </div>
    </article>
    <div class="folder-contents" data-parent="${esc(folder.id)}"${active ? '' : ' style="display:none"'}>
      ${state.folderFilter === folder.id ? renderFolderContents(folder.id, true) : ''}
    </div>`;
}

function renderFolderContents(folderId, returnHtml = false) {
  const items = state.bookmarks.filter(b => b.parentId === folderId).slice(0, 50);
  const html = items.length
    ? items.map(b => `
      <article class="folder-bookmark" draggable="true" data-id="${esc(b.id)}" data-parent="${esc(b.parentId)}">
        <img src="${faviconUrl(b.url, 16)}" alt="" loading="lazy" class="folder-bm-favicon">
        <span class="folder-bm-title">${esc(b.title)}</span>
        <button class="icon-button" type="button" data-action="open-bm" title="Open" style="width:24px;height:24px;">
          <span class="svg-icon" data-icon="external" style="width:12px;height:12px;" aria-hidden="true"></span>
        </button>
      </article>
    `).join("")
    : `<div class="folder-empty">Empty folder</div>`;
  if (returnHtml) return html;
  const container = document.querySelector(`.folder-contents[data-parent="${folderId}"]`);
  if (!container) return;
  container.innerHTML = html;
  container.style.display = "";
  attachFolderBmEvents();
}

function renderBookmarks() {
  renderFilterTabs();
  const items = filteredBookmarks();
  el.empty.hidden = items.length > 0;
  if (!items.length) {
    el.empty.innerHTML = getEmptyStateHtml();
    injectIcons();
  }
  el.list.innerHTML = items.map(renderBookmarkItem).join("");
  injectIcons();
  if (state.previewBookmark) {
    const stillExists = items.find((b) => b.id === state.previewBookmark.id);
    if (stillExists) showPreview(stillExists);
    else closePreview();
  }
}

function renderBookmarkItem(b) {
  const tags = b.tags.map((t) => `<span style="font-size:10px;color:var(--muted);background:var(--accent-soft);padding:1px 6px;border-radius:999px;margin-right:3px;">#${esc(t)}</span>`).join("");
  const selected = state.selectedBookmarkId === b.id ? " style=border-color:var(--section-accent,var(--accent));" : "";
  const deadIndicator = b.dead?.ok === false
    ? `<span title="Dead link" style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--danger);margin-right:4px;vertical-align:middle;animation:pulse-glow 1.5s ease-in-out infinite;"></span>`
    : "";
  const showHealth = state.settings.showHealthBadges;
  const healthDot = showHealth && b.health?.level === "great"
    ? `<span title="Healthy" style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--success);margin-right:4px;vertical-align:middle;"></span>`
    : showHealth && b.health?.level === "poor"
    ? `<span title="Needs attention" style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--amber-gold);margin-right:4px;vertical-align:middle;"></span>`
    : "";
  return `
    <article class="bookmark-item" data-id="${esc(b.id)}" draggable="true"${selected}>
      <div class="bookmark-item-icon">
        <img src="${faviconUrl(b.url, 32)}" alt="" loading="lazy">
      </div>
      <div class="bookmark-item-info">
        <div class="bookmark-item-title">${deadIndicator}${healthDot}${b.starred ? '<span class="svg-icon" data-icon="star" style="width:14px;height:14px;vertical-align:text-bottom;color:var(--amber-gold);display:inline-block;" aria-hidden="true"></span> ' : ''}${esc(b.title)}</div>
        <div class="bookmark-item-meta">${esc(b.url)} ${tags ? "· " + tags : ""}</div>
      </div>
      <div class="bookmark-item-actions">
        <button class="icon-button" type="button" data-action="open" title="Open" aria-label="Open" style="width:28px;height:28px;">
          <span class="svg-icon" data-icon="external" style="width:16px;height:16px;" aria-hidden="true"></span>
        </button>
        <button class="icon-button" type="button" data-action="details" title="Details" aria-label="Details" style="width:28px;height:28px;">
          <span class="svg-icon" data-icon="edit" style="width:16px;height:16px;" aria-hidden="true"></span>
        </button>
        <button class="icon-button" type="button" data-action="star" title="Star" aria-label="Star" style="width:28px;height:28px;">
          <span class="svg-icon" data-icon="star" style="width:16px;height:16px;${b.starred ? 'color:var(--amber-gold);fill:var(--amber-gold);' : ''}" aria-hidden="true"></span>
        </button>
        <button class="icon-button" type="button" data-action="delete" title="Delete" aria-label="Delete" style="width:28px;height:28px;">
          <span class="svg-icon" data-icon="trash" style="width:16px;height:16px;" aria-hidden="true"></span>
        </button>
      </div>
    </article>`;
}

function filteredBookmarks() {
  const now = Date.now();
  const scope = state.settings.searchScope || "all";
  let items = state.bookmarks.filter((b) => {
    if (state.folderFilter && b.parentId !== state.folderFilter) return false;
    if (state.filter === "starred" && !b.starred) return false;
    if (state.filter === "recent" && !isRecentBookmark(b, now)) return false;
    return true;
  });
  if (state.query) items = rankBookmarks(items, state.query, scope);
  if (state.query) return items;
  if (state.filter === "recent") return items.sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
  if (state.filter === "starred") return items.sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
  return items;
}

function isRecentBookmark(bookmark, now = Date.now()) {
  const added = bookmark.dateAdded ?? 0;
  return added > 0 && now - added <= 86400000 * RECENT_WINDOW_DAYS;
}

function rankBookmarks(bookmarks, query, scope) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return bookmarks;
  return bookmarks
    .map((bookmark) => ({ bookmark, score: scoreBookmark(bookmark, terms, scope) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.bookmark.dateAdded ?? 0) - (a.bookmark.dateAdded ?? 0))
    .map((entry) => entry.bookmark);
}

function scoreBookmark(bookmark, terms, scope) {
  const fields = [];
  if (scope === "all" || scope === "title") fields.push({ value: bookmark.title, weight: 9 });
  if (scope === "all" || scope === "url") {
    const domain = safeUrl(bookmark.url)?.hostname || "";
    fields.push({ value: domain, weight: 8 }, { value: bookmark.url, weight: 4 });
  }
  if (scope === "all" || scope === "tags") fields.push({ value: (bookmark.tags || []).join(" "), weight: 8 });
  if (scope === "all") fields.push({ value: bookmark.folderPath, weight: 5 });

  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const field of fields) {
      best = Math.max(best, scoreSearchField(field.value, term) * field.weight);
    }
    if (best === 0) return 0;
    total += best;
  }
  if (bookmark.starred) total += 2;
  if (isRecentBookmark(bookmark)) total += 1;
  return total;
}

function scoreSearchField(value, term) {
  const text = normalizeSearchText(value);
  if (!text || !term) return 0;
  if (text === term) return 12;
  if (text.startsWith(term)) return 9;
  if (text.includes(` ${term}`) || text.includes(`/${term}`) || text.includes(`.${term}`)) return 7;
  if (text.includes(term)) return 5;
  return subsequenceScore(text, term);
}

function subsequenceScore(text, term) {
  let ti = 0;
  let streak = 0;
  let score = 0;
  for (let i = 0; i < text.length && ti < term.length; i += 1) {
    if (text[i] !== term[ti]) {
      streak = 0;
      continue;
    }
    ti += 1;
    streak += 1;
    score += 0.35 + Math.min(streak * 0.15, 0.8);
  }
  return ti === term.length ? Math.min(score / Math.max(term.length, 1), 3) : 0;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
}

function getEmptyStateHtml() {
  if (state.query) {
    return `<span class="svg-icon" data-icon="search" style="width:36px;height:36px;color:var(--muted);" aria-hidden="true"></span><p>No matches for this search.</p>`;
  }
  if (state.filter === "starred") {
    return `<span class="svg-icon" data-icon="star" style="width:36px;height:36px;color:var(--muted);" aria-hidden="true"></span><p>No starred bookmarks yet. Use the star button on a bookmark to pin it here.</p>`;
  }
  if (state.filter === "recent") {
    return `<span class="svg-icon" data-icon="refresh" style="width:36px;height:36px;color:var(--muted);" aria-hidden="true"></span><p>No bookmarks added in the last ${RECENT_WINDOW_DAYS} days.</p>`;
  }
  return `<span class="svg-icon" data-icon="bookmark" style="width:36px;height:36px;color:var(--muted);" aria-hidden="true"></span><p>No bookmarks yet. Save your first page!</p>`;
}

async function fillCurrentTab() {
  const tab = await getCurrentTab();
  el.title.value = tab?.title || "";
  el.url.value = tab?.url || "";
  el.tagsInput.focus();
}

async function saveBookmarkFromForm(e) {
  e.preventDefault();
  try {
    const tags = normalizeTags(el.tagsInput.value);
    let finalTags = tags;
    if (state.settings.autoTagOnSave && !tags.length && state.bookmarks.length > 1) {
      const index = buildTermIndex(state.bookmarks);
      finalTags = suggestTags({ title: el.title.value, url: el.url.value, folderPath: "" }, index);
    }
    await createBookmark({ title: el.title.value, url: el.url.value, parentId: el.folderSelect.value || "1", tags: finalTags });
    el.form.reset();
    state.composerOpen = false;
    el.composerPanel.hidden = true;
    if (finalTags.length && !tags.length) toast(t("toast.saved") + " Tags: " + finalTags.join(", "));
    else toast(t("toast.saved"));
    await loadLibrary();
  } catch (e) { toast(e.message || "Could not save bookmark.", "error"); }
}

async function saveFolder(e) {
  e.preventDefault();
  try {
    await createFolder(el.folderName.value);
    el.folderName.value = "";
    el.folderDialog.close();
    toast("Folder created.");
    await loadLibrary();
  } catch (e) { toast(e.message || "Could not create folder.", "error"); }
}

async function saveFolderEdits(e) {
  e.preventDefault();
  try {
    await updateFolder(state.editingFolderId, el.editFolderName.value);
    el.editFolderDialog.close();
    toast("Folder updated.");
    await loadLibrary();
  } catch (e) { toast(e.message || "Could not update folder.", "error"); }
}

function handleFolderClick(e) {
  const card = e.target.closest(".folder-item");
  const btn = e.target.closest("button[data-action]");
  const info = e.target.closest("[data-action='open-folder']");
  const folder = card ? state.folders.find((f) => f.id === card.dataset.folderId) : null;
  if (!folder) return;

  if (btn?.dataset.action === "style-folder") {
    e.stopPropagation();
    openFolderStylePopover(folder, btn);
    return;
  }

  if (info || (!btn && card)) {
    if (state.folderFilter === folder.id) {
      state.folderFilter = "";
      renderFolders();
    } else {
      state.folderFilter = folder.id;
      renderFolders();
      renderFolderContents(folder.id);
    }
    return;
  }

  if (btn?.dataset.action === "filter-folder") {
    state.folderFilter = folder.id;
    if (el.folderFilterBadge) {
      el.folderFilterBadge.innerHTML = `<span class="svg-icon" data-icon="folder" style="width:14px;height:14px;vertical-align:text-bottom;" aria-hidden="true"></span> ${esc(folder.title)}`;
    }
    el.clearFolderFilter.hidden = false;
    el.clearFolderFilter.innerHTML = `<span class="svg-icon" data-icon="x" style="width:12px;height:12px;" aria-hidden="true"></span> Clear filter`;
    switchView("library");
    renderFolders();
    renderBookmarks();
  }
  if (btn?.dataset.action === "edit-folder") {
    state.editingFolderId = folder.id;
    el.editFolderName.value = folder.title;
    el.editFolderDialog.showModal();
  }
}

function openFolderStylePopover(folder, anchor) {
  if (!el.folderStylePopover) return;
  state.stylingFolderId = folder.id;
  const colorButtons = FOLDER_COLORS.map((c) => {
    const active = (folder.color || "mint") === c.id ? " is-selected" : "";
    return `<button class="folder-style-choice color-choice${active}" type="button" data-color="${esc(c.id)}" aria-label="${esc(c.label)}" title="${esc(c.label)}" style="--choice-color:var(--folder-${esc(c.id)});"><span></span></button>`;
  }).join("");
  const emojiButtons = FOLDER_EMOJIS.map((emoji) => {
    const active = folder.emoji === emoji ? " is-selected" : "";
    return `<button class="folder-style-choice emoji-choice${active}" type="button" data-emoji="${esc(emoji)}" aria-label="Use ${esc(emoji)}">${esc(emoji)}</button>`;
  }).join("");

  el.folderStylePopover.innerHTML = `
    <div class="folder-style-head">
      <strong>${esc(folder.title)}</strong>
      <button class="icon-button" type="button" data-action="clear-emoji" title="Use folder icon" aria-label="Use folder icon">
        <span class="svg-icon" data-icon="folder" aria-hidden="true"></span>
      </button>
    </div>
    <div class="folder-style-group" aria-label="Folder colors">${colorButtons}</div>
    <div class="folder-style-group emoji-grid" aria-label="Folder emojis">${emojiButtons}</div>
  `;
  injectIcons();

  const rect = anchor.getBoundingClientRect();
  const width = 256;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
  const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
  el.folderStylePopover.style.left = `${left}px`;
  el.folderStylePopover.style.top = `${top}px`;
  el.folderStylePopover.style.width = `${width}px`;
  el.folderStylePopover.hidden = false;
}

function closeFolderStylePopover() {
  if (!el.folderStylePopover) return;
  el.folderStylePopover.hidden = true;
  state.stylingFolderId = "";
}

async function handleFolderStyleClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const folderId = state.stylingFolderId;
  if (!folderId) return;
  try {
    if (btn.dataset.color) {
      await setFolderColor(folderId, btn.dataset.color);
      toast("Folder color updated.");
    }
    if (btn.dataset.emoji) {
      await setFolderEmoji(folderId, btn.dataset.emoji);
      toast("Folder icon updated.");
    }
    if (btn.dataset.action === "clear-emoji") {
      await setFolderEmoji(folderId, "");
      toast("Folder icon reset.");
    }
    closeFolderStylePopover();
    await loadLibrary();
  } catch (err) {
    toast(err.message || "Could not update folder style.", "error");
  }
}

async function handleListClick(e) {
  const btn = e.target.closest("button[data-action]");
  const item = e.target.closest(".bookmark-item");
  if (!item) return;
  const bookmark = state.bookmarks.find((b) => b.id === item.dataset.id);
  if (!bookmark) return;

  if (!btn) {
    await openBookmark(bookmark);
    return;
  }

  if (btn.dataset.action === "open") { await openBookmark(bookmark); closePreview(); }
  if (btn.dataset.action === "details") {
    state.selectedBookmarkId = item.dataset.id;
    showPreview(bookmark);
    renderBookmarks();
  }
  if (btn.dataset.action === "star") {
    const starred = await toggleStar(bookmark.id);
    bookmark.starred = starred;
    if (state.previewBookmark?.id === bookmark.id) showPreview(bookmark);
    renderBookmarks();
  }
  if (btn.dataset.action === "delete") { await deleteBookmark(bookmark); closePreview(); }
}

async function handleListChange(e) {
  const item = e.target.closest(".bookmark-item");
  if (!item) return;
  const bookmark = state.bookmarks.find((b) => b.id === item.dataset.id);
  if (!bookmark) return;
  if (e.target.dataset.field === "title") {
    const title = e.target.value.trim() || bookmark.title;
    await chrome.bookmarks.update(bookmark.id, { title });
    bookmark.title = title;
    toast("Title updated.");
  }
  if (e.target.dataset.field === "tags") {
    const tags = normalizeTags(e.target.value);
    await setTags(bookmark.id, tags);
    bookmark.tags = tags;
    renderBookmarks();
    toast("Tags updated.");
  }
}

/* ─── Drag & drop reorder ─── */

/* A real flow element inserted between items — its position is always exact,
   unlike an absolutely-positioned bar. */
let dropLine = null;
let dropContext = null;

function getDropLine() {
  if (!dropLine) {
    dropLine = document.createElement("div");
    dropLine.className = "drop-line";
    dropLine.setAttribute("aria-hidden", "true");
  }
  return dropLine;
}

function removeDropLine() {
  if (dropLine?.parentNode) dropLine.parentNode.removeChild(dropLine);
  dropContext = null;
}

function handleBookmarkDragStart(e) {
  const item = e.target.closest(".bookmark-item");
  if (!item) return;
  state.dragId = item.dataset.id;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/bookmark-id", item.dataset.id);
  el.list.classList.add("is-reordering");
  /* defer so the native drag image is captured before the element dims */
  requestAnimationFrame(() => item.classList.add("is-dragging"));
}

function clearDragState() {
  document.querySelectorAll(".bookmark-item.is-dragging, .folder-bookmark.is-dragging")
    .forEach((node) => node.classList.remove("is-dragging"));
  el.list.classList.remove("is-reordering");
  removeDropLine();
  state.dragId = "";
}

function handleDragOver(e) {
  if (!state.dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const line = getDropLine();
  const item = e.target.closest(".bookmark-item");

  if (!item) {
    if (el.list.lastElementChild !== line) el.list.appendChild(line);
    dropContext = { append: true };
    return;
  }
  if (item.dataset.id === state.dragId) { removeDropLine(); return; }

  const rect = item.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  if (before) {
    el.list.insertBefore(line, item);
    dropContext = { targetId: item.dataset.id, position: "before" };
  } else {
    el.list.insertBefore(line, item.nextElementSibling);
    dropContext = { targetId: item.dataset.id, position: "after" };
  }
}

async function handleDrop(e) {
  e.preventDefault();
  const bookmarkId = state.dragId || e.dataTransfer.getData("text/bookmark-id");
  const ctx = dropContext;
  removeDropLine();
  if (!bookmarkId || !ctx) { clearDragState(); return; }
  const dragged = state.bookmarks.find((b) => b.id === bookmarkId);
  if (!dragged) { clearDragState(); return; }

  let parentId, refId, position;
  if (ctx.append) {
    parentId = state.folderFilter || dragged.parentId;
    refId = null;
    position = "end";
  } else {
    const target = state.bookmarks.find((b) => b.id === ctx.targetId);
    parentId = target?.parentId || dragged.parentId;
    refId = ctx.targetId;
    position = ctx.position;
  }

  try {
    await reorderBookmark(bookmarkId, parentId, refId, position);
    toast(t("toast.moved", "Moved."));
    await loadLibrary();
  } catch (err) {
    toast(err.message || "Could not move.", "error");
    await loadLibrary();
  } finally {
    clearDragState();
  }
}

/* Computes the authoritative destination index from the folder's real child
   order in Chrome (not the filtered view), so the new position persists. */
async function reorderBookmark(id, parentId, refId, position) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const oldIndex = children.findIndex((c) => c.id === id);
  let target;
  if (position === "end" || !refId) {
    target = children.length;
  } else {
    const refIndex = children.findIndex((c) => c.id === refId);
    target = refIndex < 0 ? children.length : (position === "after" ? refIndex + 1 : refIndex);
  }
  /* moving down within the same folder: removing the node first shifts the
     later indices by one */
  if (oldIndex !== -1 && oldIndex < target) target -= 1;
  await chrome.bookmarks.move(id, { parentId, index: target });
}

/* ─── Folder bookmark events ─── */

function attachFolderBmEvents() {
  document.querySelectorAll(".folder-bookmark").forEach(el => {
    el.addEventListener("dragstart", (e) => {
      state.dragId = el.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/bookmark-id", el.dataset.id);
      el.style.opacity = "0.4";
    });
    el.addEventListener("dragend", () => {
      document.querySelectorAll(".folder-bookmark, .folder-item").forEach(x => x.style.opacity = "");
    });
  });
  document.querySelectorAll(".folder-item").forEach(el => {
    el.addEventListener("dragover", (e) => {
      const id = state.dragId || e.dataTransfer.getData("text/bookmark-id");
      if (!id || el.dataset.folderId === state.bookmarks.find(b => b.id === id)?.parentId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.style.opacity = "0.7";
    });
    el.addEventListener("dragleave", () => { el.style.opacity = ""; });
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.style.opacity = "";
      const id = state.dragId || e.dataTransfer.getData("text/bookmark-id");
      if (!id) return;
      const targetFolderId = el.dataset.folderId;
      try {
        await moveBookmark(id, targetFolderId);
        toast("Moved.");
        state.dragId = "";
        await loadLibrary();
      } catch (err) { toast(err.message || "Could not move.", "error"); }
    });
  });
}

/* ─── Folder bookmark clicks ─── */

document.addEventListener("click", (e) => {
  const article = e.target.closest(".folder-bookmark");
  if (!article) return;
  if (e.target.closest("button") && !e.target.closest("[data-action='open-bm']")) return;
  const bm = state.bookmarks.find(b => b.id === article.dataset.id);
  if (bm) openBookmark(bm);
});

/* ─── Folder drag & drop ─── */

function handleFolderDragOver(e) {
  const card = e.target.closest(".folder-item");
  if (!card) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  card.classList.add("is-drop-target");
}

function handleFolderDragLeave(e) {
  const card = e.target.closest(".folder-item");
  if (card && !card.contains(e.relatedTarget)) card.classList.remove("is-drop-target");
}

async function handleFolderDrop(e) {
  const card = e.target.closest(".folder-item");
  const bookmarkId = state.dragId || e.dataTransfer.getData("text/bookmark-id");
  if (!card || !bookmarkId) return;
  if (e.defaultPrevented) return;
  e.preventDefault();
  try {
    await moveBookmark(bookmarkId, card.dataset.folderId);
    toast("Moved.");
    await loadLibrary();
  } catch (e) { toast(e.message || "Could not move bookmark.", "error"); }
  finally { clearDragState(); }
}

async function openBookmark(bookmark) {
  if (state.settings.openInNewTab) await chrome.tabs.create({ url: bookmark.url });
  else { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); await chrome.tabs.update(tab.id, { url: bookmark.url }); }
}

async function deleteBookmark(bookmark) {
  if (state.settings.confirmDelete && !confirm(`Delete "${bookmark.title}"?`)) return;
  await chrome.bookmarks.remove(bookmark.id);
  await removeBookmarkMeta(bookmark.id);
  state.bookmarks = state.bookmarks.filter((b) => b.id !== bookmark.id);
  updateBadge();
  renderBookmarks();
  toast(t("toast.deleted"));
}

/* ─── Import ─── */

async function importFromFileInput(e) {
  const [file] = e.target.files;
  if (!file) return;
  await importBookmarkFile(file);
  el.importFile.value = "";
}

async function handleImportDrop(e) {
  e.preventDefault();
  el.dropZone.classList.remove("is-dragging");
  const [file] = e.dataTransfer.files;
  if (!file) return;
  await importBookmarkFile(file);
}

async function importBookmarkFile(file) {
  try {
    el.importSummary.textContent = "Reading file...";
    const text = await file.text();

    if (file.name.endsWith(".json")) {
      const payload = JSON.parse(text);
      if (payload?.app === "booki") {
        await restoreFromJsonPayload(payload);
        el.importSummary.textContent = "Import complete.";
        toast(t("toast.imported"));
        await loadLibrary();
        return;
      }
    }

    const parsed = parseBookmarkHtml(text);
    if (!parsed.bookmarks) throw new Error("No bookmarks found.");
    const destinationId = "1";
    const existingUrls = new Set(state.bookmarks.map((b) => b.url));
    const stats = await importNodes(parsed.children, destinationId, existingUrls);
    el.importSummary.textContent = `${stats.created} imported, ${stats.skipped} duplicates, ${stats.folders} folders.`;
    toast(t("toast.imported"));
    await loadLibrary();
  } catch (e) {
    el.importSummary.textContent = "";
    toast(e.message || "Could not import.", "error");
  }
}

async function restoreFromJsonPayload(payload) {
  const bookmarkMap = new Map();
  async function createTree(folders, parentFallback) {
    for (const f of folders.filter((folder) => folder.parentId === "0")) {
      bookmarkMap.set(f.id, ["1", "2", "3"].includes(f.id) ? f.id : (parentFallback || "1"));
    }
    const roots = folders.filter((f) => f.parentId === "1" || f.parentId === "2" || f.parentId === "3");
    for (const f of roots) {
      const created = await chrome.bookmarks.create({ parentId: parentFallback || f.parentId, title: f.title });
      bookmarkMap.set(f.id, created.id);
      await createChildren(f.id, folders);
    }
  }
  async function createChildren(parentId, folders) {
    const children = folders.filter((f) => f.parentId === parentId);
    for (const f of children) {
      const mapped = bookmarkMap.get(parentId) || parentId;
      const created = await chrome.bookmarks.create({ parentId: mapped, title: f.title });
      bookmarkMap.set(f.id, created.id);
      await createChildren(f.id, folders);
    }
  }
  await createTree(payload.folders ?? [], "1");
  for (const bm of payload.bookmarks ?? []) {
    const parentId = bookmarkMap.get(bm.parentId) || bm.parentId || "1";
    try { await createBookmark({ title: bm.title, url: bm.url, parentId, tags: payload.meta?.tagsByBookmarkId?.[bm.id] || [] }); } catch {}
  }
  await applyPortableMeta(payload);
}

/* ─── Organize ─── */

function renderCategories() {
  if (!el.categoryGrid) return;
  const counts = CATEGORIES.reduce((m, c) => ({ ...m, [c.id]: 0 }), {});
  let uncategorized = 0;
  for (const b of state.bookmarks) {
    if (b.category && counts[b.category] !== undefined) counts[b.category] += 1;
    else uncategorized += 1;
  }
  el.categoryGrid.innerHTML = CATEGORIES.map((c) =>
    `<article class="category-card">
      <span class="svg-icon" data-icon="bookmark" style="width:20px;height:20px;flex-shrink:0;color:var(--folder-${c.color});" aria-hidden="true"></span>
      <div class="category-card-info">
        <div class="category-card-title">${c.label}</div>
        <div class="category-card-count">${counts[c.id]} ${t("organize.saved")}</div>
      </div>
    </article>`
  ).join("") +
    `<article class="category-card">
      <span class="svg-icon" data-icon="folder" style="width:20px;height:20px;flex-shrink:0;color:var(--muted);" aria-hidden="true"></span>
      <div class="category-card-info">
        <div class="category-card-title">${t("unsorted")}</div>
        <div class="category-card-count">${uncategorized} ${t("organize.pending")}</div>
      </div>
    </article>`;
  injectIcons();
}

function analyzeLibrary() {
  const suggestions = state.bookmarks.map((b) => {
    const r = classifyBookmark(b);
    return { ...r, bookmarkId: b.id, title: b.title, url: b.url, fromCategory: b.category, currentFolderId: b.parentId };
  }).filter((s) => s.score > 0 && s.category !== s.fromCategory);
  state.organizeSuggestions = suggestions;
  renderOrganizePreview();
  toast(`${suggestions.length} suggestions ready.`);
}

function renderOrganizePreview() {
  if (!el.organizePreview) return;
  if (!state.organizeSuggestions.length) {
    el.organizePreview.innerHTML = `<div class="empty-state" style="padding:16px;"><span class="svg-icon" data-icon="wand" style="width:36px;height:36px;color:var(--muted);" aria-hidden="true"></span><p style="margin:0;font-size:13px;">${t("organize.empty")}</p></div>`;
    el.applyOrganizeButton.disabled = true;
    return;
  }
  el.applyOrganizeButton.disabled = false;
  el.organizePreview.innerHTML = state.organizeSuggestions.map((s) =>
    `<article style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:8px 12px;background:var(--glass);backdrop-filter:blur(12px) saturate(1.1);-webkit-backdrop-filter:blur(12px) saturate(1.1);border:1px solid var(--glass-border);border-radius:var(--radius-md);">
      <span class="svg-icon" data-icon="wand" style="width:18px;height:18px;color:var(--accent);" aria-hidden="true"></span>
      <div><strong style="font-size:12px;">${esc(s.title)}</strong><br><small style="color:var(--muted);font-size:10px;">${esc(s.reason)} — ${Math.round(s.score * 100)}%</small></div>
      <span style="font-size:11px;font-weight:600;">${categoryLabel(s.category)}</span>
    </article>`
  ).join("");
  injectIcons();
}

async function applyOrganizePreview() {
  const foldersByCategory = {};
  try {
    for (const s of state.organizeSuggestions) {
      let folderId = foldersByCategory[s.category] || findOrCreateTargetFolderId(s.category);
      if (!folderId) {
        const folder = await createFolder(categoryLabel(s.category), "1");
        folderId = folder.id;
        foldersByCategory[s.category] = folderId;
        await setFolderColor(folderId, categoryColor(s.category));
      }
      await setCategory(s.bookmarkId, s.category);
      if (s.currentFolderId !== folderId) await moveBookmark(s.bookmarkId, folderId);
    }
    toast("Organization applied.");
    state.organizeSuggestions = [];
    await loadLibrary();
    renderOrganizePreview();
  } catch (e) { toast(e.message || "Could not apply.", "error"); }
}

function classifyBookmark(bookmark) {
  const url = safeUrl(bookmark.url);
  const domain = url?.hostname.replace(/^www\./, "") ?? "";
  const text = `${bookmark.title} ${bookmark.url} ${domain} ${bookmark.tags.join(" ")}`.toLowerCase();
  let best = { category: "", score: 0, reason: "" };
  for (const c of CATEGORIES) {
    const matches = c.keywords.filter((kw) => text.includes(kw));
    const domainMatch = matches.some((kw) => domain.includes(kw));
    const score = Math.min(0.96, matches.length * 0.22 + (domainMatch ? 0.28 : 0));
    if (score > best.score) best = { category: c.id, score, reason: matches.length ? `Matched ${matches.slice(0, 3).join(", ")}` : "Domain pattern" };
  }
  if (!best.category && domain) {
    const tld = domain.split(".").pop();
    if (["edu", "org", "dev"].includes(tld)) best = { category: "research", score: 0.46, reason: `${tld} domain signal` };
  }
  return best;
}

function findOrCreateTargetFolderId(categoryId) {
  const label = categoryLabel(categoryId).toLowerCase();
  return state.folders.find((f) => f.title.toLowerCase() === label)?.id ?? "";
}

/* ─── Dedup ─── */

function findAndShowDuplicates() {
  const dupes = findDuplicates(state.bookmarks);
  const container = el.organizePreview;
  if (!container) return;
  if (!dupes.length) {
    container.innerHTML = `<div class="empty-state"><span class="svg-icon" data-icon="check" style="width:36px;height:36px;color:var(--success);" aria-hidden="true"></span><p style="margin:0;font-size:13px;">No duplicates found.</p></div>`;
    return;
  }
  container.innerHTML = `<p style="margin:0 0 6px;font-size:12px;font-weight:600;color:var(--muted);">${dupes.length} duplicate(s):</p>` +
    dupes.map((d) =>
      `<article style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 12px;background:var(--glass);backdrop-filter:blur(12px) saturate(1.1);-webkit-backdrop-filter:blur(12px) saturate(1.1);border:1px solid var(--glass-border);border-radius:var(--radius-md);font-size:12px;">
        <div style="min-width:0;">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">${esc(d.original.title)}</div>
          <div style="color:var(--muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.duplicate.title)}</div>
        </div>
        <button class="small-button" type="button" data-action="delete-dupe" data-id="${esc(d.duplicate.id)}">Delete</button>
      </article>`
    ).join("");
  injectIcons();
  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='delete-dupe']");
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      await chrome.bookmarks.remove(id);
      await removeBookmarkMeta(id);
      state.bookmarks = state.bookmarks.filter((b) => b.id !== id);
      toast("Duplicate removed.");
      await loadLibrary();
    } catch (e) { toast(e.message || "Could not delete.", "error"); }
  });
}

async function runDeadLinkCheck() {
  toast("Checking dead links...");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "check-dead-links" });
    if (resp?.ok) toast("Dead link check complete.");
    else toast("Check failed.", "error");
    await loadLibrary();
  } catch (e) { toast(e.message || "Check failed.", "error"); }
}

/* ─── Export ─── */

function exportBookmarksHtml() {
  const tree = buildExportTree();
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Booki Export</TITLE>
<H1>Booki Export</H1>
${renderExportDl(tree)}`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `booki-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toast(t("toast.exported"));
}

async function exportBookmarksJson() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "export-booki" });
    if (!resp?.ok) throw new Error(resp?.error || "Export failed");
    const blob = new Blob([resp.json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resp.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast(t("toast.exported"));
  } catch (e) { toast(e.message || "Could not export.", "error"); }
}

function buildExportTree() {
  const root = { title: "Booki", children: [] };
  const folderMap = new Map(state.folders.map((f) => [f.id, { ...f, children: [] }]));
  for (const f of folderMap.values()) {
    if (f.parentId && folderMap.has(f.parentId)) folderMap.get(f.parentId).children.push(f);
    else root.children.push(f);
  }
  for (const b of state.bookmarks) {
    const target = folderMap.get(b.parentId) ?? root;
    target.children.push({ ...b, type: "bookmark" });
  }
  return root;
}

function renderExportDl(node) {
  const children = node.children ?? [];
  return `<DL><p>\n${children.map((child) => {
    if (child.type === "bookmark" || child.url) return `<DT><A HREF="${escAttr(child.url)}" ADD_DATE="${Math.floor((child.dateAdded ?? Date.now()) / 1000)}">${esc(child.title)}</A>`;
    return `<DT><H3>${esc(child.title)}</H3>\n${renderExportDl(child)}`;
  }).join("\n")}\n</DL><p>`;
}

/* ─── Sync (chrome.storage.sync) ─── */

async function pushSync() {
  try {
    const snapshot = await pushSyncSnapshot();
    const summary = el.syncSummary || el.cloudSyncSummary;
    if (summary) summary.textContent = `Synced at ${new Date(snapshot.savedAt).toLocaleString()}.`;
    toast(t("toast.cloud.pushed"));
  } catch (e) { toast(e.message || "Could not push.", "error"); }
}

async function pullSync() {
  try {
    const snapshot = await pullSyncSnapshot();
    const summary = el.cloudSyncSummary;
    if (!snapshot) { if (summary) summary.textContent = "No cloud sync found."; return; }
    if (summary) summary.textContent = `Pulled from ${new Date(snapshot.savedAt).toLocaleString()}.`;
    toast(t("toast.cloud.pulled"));
    await loadLibrary();
  } catch (e) { toast(e.message || "Could not pull.", "error"); }
}

/* ─── Sync Code ─── */

async function handleGenerateSyncCode() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "generate-sync-code" });
    if (!resp?.ok) throw new Error(resp?.error || "Failed to generate code");
    el.syncCodeInput.value = resp.code;
    el.syncSummary.textContent = "Metadata code generated. Use it on your other device within 30 days.";
    showQRCode(resp.code);
    toast(t("toast.code.generated"));
  } catch (e) { toast(e.message || "Could not generate code.", "error"); }
}

function handleCopySyncCode() {
  if (!el.syncCodeInput.value) return;
  navigator.clipboard.writeText(el.syncCodeInput.value).then(() => toast(t("toast.code.copied"))).catch(() => {});
}

async function handleRestoreFromCode() {
  const code = el.restoreSyncCode.value.trim().toUpperCase();
  if (!code || code.length < 4) { toast("Enter a valid sync code.", "error"); return; }
  try {
    const resp = await chrome.runtime.sendMessage({ type: "restore-from-code", code });
    if (!resp?.ok) throw new Error(resp?.error || "Restore failed");
    toast("Metadata applied.");
    el.restoreSyncCode.value = "";
    await loadLibrary();
  } catch (e) { toast(e.message || "Could not restore.", "error"); }
}

/* ─── QR Code ─── */

function showQRCode(text) {
  if (!el.qrContainer || !text) return;
  el.qrContainer.innerHTML = `<div class="sync-code-card" aria-label="Sync code">${esc(text)}</div>`;
}

/* ─── Import helpers ─── */

async function importNodes(nodes, parentId, existingUrls) {
  const stats = { created: 0, skipped: 0, folders: 0 };
  for (const node of nodes) {
    if (node.type === "folder") {
      const folder = await createFolder(node.title || "Imported folder", parentId);
      stats.folders += 1;
      const childStats = await importNodes(node.children, folder.id, existingUrls);
      stats.created += childStats.created; stats.skipped += childStats.skipped; stats.folders += childStats.folders;
      continue;
    }
    if (existingUrls.has(node.url)) { stats.skipped += 1; continue; }
    await createBookmark({ title: node.title || node.url, url: node.url, parentId, tags: ["imported"] });
    existingUrls.add(node.url);
    stats.created += 1;
  }
  return stats;
}

function parseBookmarkHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const firstDl = doc.querySelector("dl");
  return { children: firstDl ? parseBookmarkDl(firstDl) : [], bookmarks: countBookmarkNodes(firstDl ? parseBookmarkDl(firstDl) : []) };
}

function parseBookmarkDl(dl) {
  const nodes = [];
  for (const child of dl.children) {
    if (child.tagName !== "DT") continue;
    const a = directChild(child, "A");
    const href = a?.getAttribute("href")?.trim();
    if (href) { nodes.push({ type: "bookmark", title: a.textContent.trim() || href, url: href }); continue; }
    const h3 = directChild(child, "H3");
    const nested = directChild(child, "DL");
    if (h3 || nested) nodes.push({ type: "folder", title: h3?.textContent.trim() || "Imported folder", children: nested ? parseBookmarkDl(nested) : [] });
  }
  return nodes;
}

function directChild(el, tag) { return [...el.children].find((c) => c.tagName === tag); }
function countBookmarkNodes(nodes) { return nodes.reduce((t, n) => n.type === "bookmark" ? t + 1 : t + countBookmarkNodes(n.children), 0); }
function folderSort(a, b) { return a.folderPath.localeCompare(b.folderPath); }
function categoryLabel(id) { return CATEGORIES.find((c) => c.id === id)?.label ?? "Unsorted"; }
function categoryColor(id) { return CATEGORIES.find((c) => c.id === id)?.color ?? "graphite"; }
function safeUrl(v) { try { return new URL(v); } catch { return null; } }
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escAttr(v) { return esc(v).replaceAll("`", "&#096;"); }
