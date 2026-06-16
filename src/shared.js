const DEFAULT_SETTINGS = {
  openInNewTab: true,
  openInTab: false,
  focusSearch: true,
  language: "",
  defaultView: "library",
  autoTagOnSave: true,
  confirmDelete: true,
  accentColor: "auto",
  compactView: false,
  showHealthBadges: true,
  rememberView: true,
  searchScope: "all",
  deadLinkBadge: true
};

const DEFAULT_META = {
  tagsByBookmarkId: {},
  starredIds: [],
  folderColorsById: {},
  categoriesByBookmarkId: {},
  deadLinks: {},
  pageContent: {},
  healthScores: {}
};

/* ─── Settings ─── */

export async function getSettings() {
  const result = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function saveSettings(settings) {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...settings } });
  chrome.runtime.sendMessage({ type: "settings-changed" }).catch(() => {});
}

/* ─── Meta ─── */

export async function getMeta() {
  const result = await chrome.storage.local.get({ meta: DEFAULT_META });
  return {
    tagsByBookmarkId: result.meta?.tagsByBookmarkId ?? {},
    starredIds: result.meta?.starredIds ?? [],
    folderColorsById: result.meta?.folderColorsById ?? {},
    categoriesByBookmarkId: result.meta?.categoriesByBookmarkId ?? {},
    deadLinks: result.meta?.deadLinks ?? {},
    pageContent: result.meta?.pageContent ?? {},
    healthScores: result.meta?.healthScores ?? {}
  };
}

export async function saveMeta(meta) {
  await chrome.storage.local.set({
    meta: {
      tagsByBookmarkId: meta.tagsByBookmarkId ?? {},
      starredIds: [...new Set(meta.starredIds ?? [])],
      folderColorsById: meta.folderColorsById ?? {},
      categoriesByBookmarkId: meta.categoriesByBookmarkId ?? {},
      deadLinks: meta.deadLinks ?? {},
      pageContent: meta.pageContent ?? {},
      healthScores: meta.healthScores ?? {}
    }
  });
}

/* ─── Sync (chrome.storage.sync) ─── */

export async function pushSyncSnapshot() {
  const [settings, meta] = await Promise.all([getSettings(), getMeta()]);
  /* Only sync portable metadata. pageContent (read-later, up to 50KB each)
     and deadLinks (device-specific, regenerated daily) are excluded to stay
     within the chrome.storage.sync quota. */
  const snapshot = {
    version: 2,
    savedAt: new Date().toISOString(),
    app: "booki",
    settings,
    meta: {
      tagsByBookmarkId: meta.tagsByBookmarkId,
      starredIds: meta.starredIds,
      folderColorsById: meta.folderColorsById,
      categoriesByBookmarkId: meta.categoriesByBookmarkId
    }
  };
  await chrome.storage.sync.set({ bookiSnapshot: snapshot });
  return snapshot;
}

export async function pullSyncSnapshot() {
  const result = await chrome.storage.sync.get({ bookiSnapshot: null });
  const snapshot = result.bookiSnapshot;
  if (!snapshot) return null;

  const [currentSettings, currentMeta] = await Promise.all([getSettings(), getMeta()]);
  const mergedSettings = { ...currentSettings, ...snapshot.settings };
  /* Merge incoming portable meta over local, but preserve device-local
     pageContent and deadLinks that the snapshot never carries. */
  const incoming = snapshot.meta ?? {};
  const mergedMeta = {
    ...currentMeta,
    tagsByBookmarkId: { ...currentMeta.tagsByBookmarkId, ...(incoming.tagsByBookmarkId ?? {}) },
    starredIds: [...new Set([...currentMeta.starredIds, ...(incoming.starredIds ?? [])])],
    folderColorsById: { ...currentMeta.folderColorsById, ...(incoming.folderColorsById ?? {}) },
    categoriesByBookmarkId: { ...currentMeta.categoriesByBookmarkId, ...(incoming.categoriesByBookmarkId ?? {}) }
  };
  await Promise.all([
    saveSettings(mergedSettings),
    saveMeta(mergedMeta)
  ]);

  return snapshot;
}

/* ─── Tags ─── */

export async function setTags(bookmarkId, tags) {
  const meta = await getMeta();
  const cleanTags = normalizeTags(tags);

  if (cleanTags.length) {
    meta.tagsByBookmarkId[bookmarkId] = cleanTags;
  } else {
    delete meta.tagsByBookmarkId[bookmarkId];
  }

  await saveMeta(meta);
}

export async function toggleStar(bookmarkId) {
  const meta = await getMeta();
  const starred = new Set(meta.starredIds);

  if (starred.has(bookmarkId)) {
    starred.delete(bookmarkId);
  } else {
    starred.add(bookmarkId);
  }

  meta.starredIds = [...starred];
  await saveMeta(meta);
  return starred.has(bookmarkId);
}

export async function removeBookmarkMeta(bookmarkId) {
  const meta = await getMeta();
  delete meta.tagsByBookmarkId[bookmarkId];
  meta.starredIds = meta.starredIds.filter((id) => id !== bookmarkId);
  delete meta.categoriesByBookmarkId[bookmarkId];
  delete meta.deadLinks[bookmarkId];
  delete meta.pageContent[bookmarkId];
  delete meta.healthScores[bookmarkId];
  await saveMeta(meta);
}

export async function setFolderColor(folderId, color) {
  const meta = await getMeta();
  meta.folderColorsById[folderId] = color;
  await saveMeta(meta);
}

export async function setCategory(bookmarkId, category) {
  const meta = await getMeta();
  if (category) {
    meta.categoriesByBookmarkId[bookmarkId] = category;
  } else {
    delete meta.categoriesByBookmarkId[bookmarkId];
  }
  await saveMeta(meta);
}

export async function removeFolderColor(folderId) {
  const meta = await getMeta();
  delete meta.folderColorsById[folderId];
  await saveMeta(meta);
}

/* ─── Tab helpers ─── */

export async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function openSidePanelForCurrentWindow() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.windowId) return;
  await chrome.sidePanel.open({ windowId: tab.windowId });
}

/* ─── Bookmark tree ─── */

export async function getBookmarkTreeData() {
  const resp = await chrome.runtime.sendMessage({ type: "get-bookmark-index" });
  if (!resp?.ok || !resp.index) return { folders: [], bookmarks: [], meta: await getMeta() };

  const meta = await getMeta();
  const starred = new Set(meta.starredIds);
  const countByFolderId = resp.index.bookmarks.reduce((counts, bm) => {
    counts[bm.parentId] = (counts[bm.parentId] ?? 0) + 1;
    return counts;
  }, {});

  const enrichedFolders = resp.index.folders.map((f) => ({
    ...f,
    color: meta.folderColorsById[f.id] ?? "mint",
    count: countByFolderId[f.id] ?? 0
  }));

  const enrichedBookmarks = resp.index.bookmarks.map((bm) => ({
    ...bm,
    tags: meta.tagsByBookmarkId[bm.id] ?? [],
    category: meta.categoriesByBookmarkId[bm.id] ?? "",
    starred: starred.has(bm.id),
    dead: meta.deadLinks?.[bm.id],
    health: computeHealth(
      { ...bm, starred: starred.has(bm.id), tags: meta.tagsByBookmarkId[bm.id] ?? [] },
      meta
    )
  }));

  return { folders: enrichedFolders, bookmarks: enrichedBookmarks, meta, deadLinks: meta.deadLinks || {} };
}

export async function getLocalBookmarkTree() {
  try {
    const [root] = await chrome.bookmarks.getTree();
    const folders = [];
    const bookmarks = [];
    walkBookmarksTree(root, [], folders, bookmarks);
    return { folders, bookmarks };
  } catch {
    return { folders: [], bookmarks: [] };
  }
}

function walkBookmarksTree(node, path, folders, bookmarks) {
  if (node.children) {
    if (node.id !== "0") {
      folders.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || "Bookmarks",
        path: [...path, node.title].filter(Boolean).join(" / "),
        depth: path.length
      });
    }
    const nextPath = node.id === "0" ? path : [...path, node.title].filter(Boolean);
    node.children.forEach((child) => walkBookmarksTree(child, nextPath, folders, bookmarks));
    return;
  }
  if (node.url) {
    bookmarks.push({
      id: node.id,
      parentId: node.parentId,
      title: node.title || node.url,
      url: node.url,
      dateAdded: node.dateAdded,
      folderPath: path.join(" / ") || "Bookmarks"
    });
  }
}

/* ─── SVG icon injection ─── */

export function injectIcons() {
  const els = document.querySelectorAll(".svg-icon[data-icon]");
  if (!els.length) return;
  /* lazy import to avoid circular deps */
  import("./icons.js").then((mod) => {
    els.forEach((el) => {
      const name = el.getAttribute("data-icon");
      const svg = mod.icon(name);
      if (!svg) return;
      const wrapper = document.createElement("span");
      wrapper.innerHTML = svg;
      const svgEl = wrapper.firstElementChild;
      if (!svgEl) return;
      /* copy attributes from placeholder to SVG */
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name !== "data-icon" && attr.name !== "class") {
          svgEl.setAttribute(attr.name, attr.value);
        }
      });
      el.replaceWith(svgEl);
    });
  }).catch(() => {});
}

/* ─── CRUD ─── */

export async function createBookmark({ title, url, parentId, tags }) {
  const bookmark = await chrome.bookmarks.create({
    parentId,
    title: title.trim(),
    url: normalizeUrl(url)
  });

  await setTags(bookmark.id, tags);
  return bookmark;
}

export async function createFolder(title, parentId = "1") {
  return chrome.bookmarks.create({ parentId, title: title.trim() });
}

export async function updateFolder(folderId, title) {
  return chrome.bookmarks.update(folderId, { title: title.trim() });
}

export async function moveBookmark(bookmarkId, parentId, index) {
  const destination = { parentId };
  if (Number.isInteger(index)) {
    destination.index = index;
  }
  return chrome.bookmarks.move(bookmarkId, destination);
}

/* ─── Normalization ─── */

export function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(cleanTag).filter(Boolean))];
  }
  return [...new Set(String(value ?? "").split(",").map(cleanTag).filter(Boolean))];
}

export function normalizeUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return value;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function faviconUrl(pageUrl, size = 32) {
  if (!pageUrl) return "";
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}

/* ─── Toast ─── */

export function toast(message, type = "success") {
  const element = document.querySelector("#toast");
  if (!element) return;

  element.textContent = message;
  element.dataset.type = type;
  element.classList.remove("is-visible");

  /* force reflow for re-trigger */
  void element.offsetWidth;

  element.classList.add("is-visible");

  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    element.classList.remove("is-visible");
  }, 3000);
}

/* ─── Formatting ─── */

export function formatDate(timestamp) {
  if (!timestamp) return "No date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(timestamp));
}

/* ─── Emoji helpers ─── */

export function folderEmoji(folderId, folderColors) {
  const colorMap = {
    coral: "🔴",
    orange: "🟠",
    yellow: "🟡",
    green: "🟢",
    mint: "🟢",
    teal: "🔵",
    blue: "🔵",
    purple: "🟣",
    pink: "🩷",
    red: "🔴",
    grey: "⚪",
    default: "📁"
  };
  const color = folderColors?.[folderId] || "default";
  return colorMap[color] || colorMap.default;
}

/* ─── Auto-tagging (TF-IDF) ─── */

export function buildTermIndex(bookmarks) {
  const docCount = bookmarks.length;
  const df = {};
  const corpus = bookmarks.map((b) => {
    const terms = termize(`${b.title} ${b.url} ${b.folderPath}`);
    const unique = new Set(terms);
    unique.forEach((t) => { df[t] = (df[t] || 0) + 1; });
    return { id: b.id, terms };
  });
  return { corpus, df, docCount };
}

export function suggestTags(bookmark, termIndex, maxTags = 3) {
  if (!termIndex || termIndex.docCount < 2) return [];
  const text = termize(`${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`);
  const scores = {};
  for (const term of text) {
    const docFreq = termIndex.df[term] || 1;
    const tf = text.filter((t) => t === term).length / text.length;
    const idf = Math.log(termIndex.docCount / docFreq);
    const score = tf * idf;
    if (score > 0.01) scores[term] = (scores[term] || 0) + score;
  }
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag);
}

export function findDuplicates(bookmarks) {
  const urlMap = new Map();
  const dupes = [];
  for (const b of bookmarks) {
    if (!b.url) continue;
    if (urlMap.has(b.url)) dupes.push({ original: urlMap.get(b.url), duplicate: b });
    else urlMap.set(b.url, b);
  }
  return dupes;
}

function termize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
    .slice(0, 50);
}

const STOP_WORDS = new Set([
  "the","and","for","are","but","not","you","all","can","had","her","was",
  "one","our","out","has","have","been","its","more","some","them","then",
  "than","that","this","with","what","which","when","where","how","who",
  "www","com","org","net","http","https","html","page","site","web","blog"
]);

/* ─── Health scoring ─── */

export function computeHealth(bookmark, meta) {
  let score = 50;
  const reasons = [];

  if (bookmark.starred) { score += 15; reasons.push("starred"); }
  if ((bookmark.tags || []).length > 0) { score += 10; reasons.push("tagged"); }
  if (bookmark.category) { score += 10; reasons.push("categorized"); }

  const age = Date.now() - (bookmark.dateAdded || 0);
  const daysOld = age / 86400000;
  if (daysOld < 7) { score += 10; reasons.push("fresh"); }
  else if (daysOld > 365) { score -= 10; reasons.push("aged"); }

  const dead = meta.deadLinks?.[bookmark.id];
  if (dead && dead.ok === false) { score -= 20; reasons.push("dead"); }

  if ((bookmark.tags || []).length > 5) score -= 5;

  return {
    score: Math.max(0, Math.min(100, score)),
    level: score >= 80 ? "great" : score >= 50 ? "ok" : "poor",
    reasons
  };
}

/* ─── Content storage ─── */

export async function savePageContent(bookmarkId, text) {
  const meta = await getMeta();
  if (!meta.pageContent) meta.pageContent = {};
  meta.pageContent[bookmarkId] = text.slice(0, 50000);
  await saveMeta(meta);
}

export async function getPageContent(bookmarkId) {
  const meta = await getMeta();
  return meta.pageContent?.[bookmarkId] || null;
}

/* ─── Private ─── */

function cleanTag(tag) {
  return String(tag ?? "").trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-").slice(0, 32);
}
