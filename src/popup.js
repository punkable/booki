import { faviconUrl, getCurrentTab, injectIcons, toast, getSettings, saveSettings, getMeta, toggleStar, openSidePanelForCurrentWindow } from "./shared.js";
import { detectBrowserLanguage, setLanguage, t } from "./i18n.js";

injectIcons();

let activeTab;
let allBookmarks = [];
let allFolders = [];
let currentBookmark = null;

init();

async function init() {
  const settings = await getSettings();
  const lang = settings.language || detectBrowserLanguage();
  setLanguage(lang);

  applyI18n();
  try {
    activeTab = await getCurrentTab();
    renderTab(activeTab);
    await checkStarStatus();
  } catch { /* silent */ }

  await loadBookmarksAndFolders();

  document.querySelector("#openPanel").addEventListener("click", openManager);
  document.querySelector("#openLibrary").addEventListener("click", openManager);
  document.querySelector("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  document.querySelector("#quickSaveForm").addEventListener("submit", saveCurrentTab);
  document.querySelector("#starCurrent").addEventListener("click", toggleCurrentStar);

  const searchInput = document.querySelector("#popupSearch");
  searchInput.addEventListener("input", () => {
    renderResults(searchInput.value.trim().toLowerCase());
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchInput.value.trim()) {
      chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html?q=" + encodeURIComponent(searchInput.value.trim())) });
    }
  });

  renderResults("");
}

async function checkStarStatus() {
  if (!activeTab?.url) return;
  const meta = await getMeta();
  const starred = new Set(meta.starredIds);
  const existing = await chrome.bookmarks.search({ url: activeTab.url });
  const starBtn = document.querySelector("#starCurrent");
  if (existing[0]) {
    starBtn.hidden = false;
    starBtn.dataset.bookmarkId = existing[0].id;
    const isStarred = starred.has(existing[0].id);
    starBtn.innerHTML = isStarred
      ? `<span class="svg-icon" data-icon="star" style="width:18px;height:18px;color:var(--amber-gold);fill:var(--amber-gold);" aria-hidden="true"></span>`
      : `<span class="svg-icon" data-icon="star" style="width:18px;height:18px;" aria-hidden="true"></span>`;
  } else {
    starBtn.hidden = true;
  }
}

async function toggleCurrentStar() {
  const btn = document.querySelector("#starCurrent");
  const id = btn.dataset.bookmarkId;
  if (!id) return;
  const starred = await toggleStar(id);
  btn.innerHTML = starred
    ? `<span class="svg-icon" data-icon="star" style="width:18px;height:18px;color:var(--amber-gold);fill:var(--amber-gold);" aria-hidden="true"></span>`
    : `<span class="svg-icon" data-icon="star" style="width:18px;height:18px;" aria-hidden="true"></span>`;
  toast(starred ? "Starred" : "Unstarred");
}

async function loadBookmarksAndFolders() {
  try {
    const [root] = await chrome.bookmarks.getTree();
    allFolders = [];
    walkFolders(root, [], 0, allFolders);
    const select = document.querySelector("#folderSelect");
    select.innerHTML = allFolders.map(f =>
      `<option value="${f.id}">${esc(f.path || f.title)}</option>`
    ).join("");

    const [bookmarkRoot] = await chrome.bookmarks.getTree();
    allBookmarks = [];
    walkBookmarksForList(bookmarkRoot, allBookmarks);
    allBookmarks.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    syncCurrentBookmarkState();
    renderResults("");
  } catch { /* silent */ }
}

function walkFolders(node, path, depth, result) {
  if (node.children) {
    const title = node.title || (node.id === "1" ? "Bookmarks bar" : "Bookmarks");
    const nextPath = node.id === "0" ? path : [...path, title].filter(Boolean);
    if (node.id !== "0") {
      result.push({ id: node.id, title, path: nextPath.join(" / "), depth });
    }
    node.children.forEach(child => walkFolders(child, nextPath, node.id === "0" ? depth : depth + 1, result));
  }
}

function walkBookmarksForList(node, result) {
  if (node.children) {
    node.children.forEach(child => walkBookmarksForList(child, result));
  } else if (node.url) {
    result.push({ id: node.id, parentId: node.parentId, title: node.title || node.url, url: node.url, dateAdded: node.dateAdded });
  }
}

function renderTab(tab) {
  const titleEl = document.querySelector("#pageTitle");
  const urlEl = document.querySelector("#pageUrl");
  const iconEl = document.querySelector("#pageIcon");
  titleEl.classList.remove("skeleton-line");
  urlEl.classList.remove("skeleton-line", "short");
  titleEl.textContent = tab?.title || "Untitled page";
  urlEl.textContent = tab?.url || "";
  iconEl.src = faviconUrl(tab?.url, 32);
}

function renderResults(query) {
  const container = document.querySelector("#popupResults");
  const title = document.querySelector("#resultsTitle");
  const count = document.querySelector("#resultsCount");
  const items = query
    ? allBookmarks.filter(b => (b.title + " " + b.url).toLowerCase().includes(query)).slice(0, 8)
    : allBookmarks.slice(0, 5);
  if (title) title.textContent = query ? "Search results" : "Recent bookmarks";
  if (count) count.textContent = items.length ? String(items.length) : "";

  if (!items.length) {
    container.innerHTML = `<div class="popup-empty">${query ? "No results" : "No recent bookmarks"}</div>`;
    return;
  }
  container.innerHTML = items.map(b => `
    <article class="popup-result" data-url="${escAttr(b.url)}">
      <img src="${faviconUrl(b.url, 16)}" alt="" class="popup-result-favicon" loading="lazy">
      <div class="popup-result-info">
        <span class="popup-result-title">${esc(b.title)}</span>
        <span class="popup-result-url">${esc(b.url)}</span>
      </div>
      <button class="icon-button" type="button" data-action="open-result" title="Open" aria-label="Open" style="width:26px;height:26px;">
        <span class="svg-icon" data-icon="external" style="width:14px;height:14px;" aria-hidden="true"></span>
      </button>
    </article>
  `).join("");
  injectIcons();

  container.querySelectorAll("[data-action='open-result']").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const article = e.target.closest(".popup-result");
      if (article?.dataset.url) chrome.tabs.create({ url: article.dataset.url });
    });
  });
  container.querySelectorAll(".popup-result").forEach(article => {
    article.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      if (article.dataset.url) chrome.tabs.create({ url: article.dataset.url });
    });
  });
}

async function saveCurrentTab(event) {
  event.preventDefault();
  const tags = document.querySelector("#quickTags").value;
  const parentId = document.querySelector("#folderSelect").value || "1";
  const response = await chrome.runtime.sendMessage({
    type: "save-current-tab",
    tags,
    parentId
  });
  if (!response?.ok) {
    toast(response?.error || "Could not save this page.", "error");
    return;
  }
  document.querySelector("#quickTags").value = "";
  const status = document.querySelector("#quickSaveStatus");
  if (response.bookmark?.alreadyExisted) {
    const message = response.bookmark.moved ? "Updated and moved to the selected folder." : "Already saved. Metadata updated.";
    if (status) status.textContent = message;
    toast("Updated!");
  } else {
    if (status) status.textContent = "Saved to the selected folder.";
    toast("Saved!");
  }
  await loadBookmarksAndFolders();
}

function syncCurrentBookmarkState() {
  currentBookmark = activeTab?.url ? allBookmarks.find((bookmark) => bookmark.url === activeTab.url) || null : null;
  const select = document.querySelector("#folderSelect");
  const label = document.querySelector("#quickSaveLabel");
  const status = document.querySelector("#quickSaveStatus");
  if (currentBookmark && select) select.value = currentBookmark.parentId;
  if (label) label.textContent = currentBookmark ? "Update" : "Save";
  if (status) {
    const folder = currentBookmark ? allFolders.find((f) => f.id === currentBookmark.parentId) : null;
    status.textContent = currentBookmark ? `Already saved in ${folder?.path || folder?.title || "Bookmarks"}. Choose another folder to move it.` : "Choose a folder for the current tab.";
  }
}

async function openManager() {
  const settings = await getSettings();
  if (settings.openInTab) {
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
  } else {
    await openSidePanelForCurrentWindow();
  }
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
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function escAttr(v) { return esc(v).replaceAll("`", "&#096;"); }
