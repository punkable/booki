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
  deadLinkBadge: true,
  importMode: "merge"
};

const DEFAULT_META = {
  tagsByBookmarkId: {},
  starredIds: [],
  folderColorsById: {},
  folderEmojisById: {},
  categoriesByBookmarkId: {},
  deadLinks: {},
  pageContent: {},
  healthScores: {}
};

export const ACCENT_COLORS = {
  amber: "#dfaa75",
  copper: "#b9875f",
  rose: "#c85f8b",
  violet: "#7357c8",
  blue: "#2d8ecf",
  graphite: "#302f35"
};

/* ─── Settings ─── */

export async function getSettings() {
  const result = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
  const settings = { ...DEFAULT_SETTINGS, ...result.settings };
  if (settings.accentColor === "blaze") settings.accentColor = "copper";
  if (settings.accentColor === "pink") settings.accentColor = "rose";
  return settings;
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const next = { ...current, ...settings };
  await chrome.storage.local.set({ settings: next });
  chrome.runtime.sendMessage({ type: "settings-changed", settings: next }).catch(() => {});
}

export function applyAccentColor(settings, root = document.documentElement) {
  const color = ACCENT_COLORS[settings?.accentColor];
  if (!color || settings?.accentColor === "auto") {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--section-accent");
    root.style.removeProperty("--section-gradient");
    return;
  }
  root.style.setProperty("--accent", color);
  root.style.setProperty("--section-accent", color);
  root.style.setProperty("--section-gradient", `linear-gradient(135deg, ${color}, #302f35)`);
}

/* ─── Meta ─── */

export async function getMeta() {
  const result = await chrome.storage.local.get({ meta: DEFAULT_META });
  return {
    tagsByBookmarkId: result.meta?.tagsByBookmarkId ?? {},
    starredIds: result.meta?.starredIds ?? [],
    folderColorsById: result.meta?.folderColorsById ?? {},
    folderEmojisById: result.meta?.folderEmojisById ?? {},
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
      folderEmojisById: meta.folderEmojisById ?? {},
      categoriesByBookmarkId: meta.categoriesByBookmarkId ?? {},
      deadLinks: meta.deadLinks ?? {},
      pageContent: meta.pageContent ?? {},
      healthScores: meta.healthScores ?? {}
    }
  });
}

/* ─── Sync (chrome.storage.sync) ─── */

const SYNC_MANIFEST_KEY = "bookiSnapshotManifest";
const SYNC_LEGACY_KEY = "bookiSnapshot";
const SYNC_CHUNK_PREFIX = "bookiSnapshotChunk_";
const SYNC_CHUNK_SIZE = 7000;

export async function pushSyncSnapshot() {
  const snapshot = await buildPortableSyncPayload();
  await writeChunkedSyncSnapshot(snapshot);
  return snapshot;
}

export async function pullSyncSnapshot() {
  const snapshot = await readChunkedSyncSnapshot();
  if (!snapshot) return null;

  const currentSettings = await getSettings();
  const mergedSettings = { ...currentSettings, ...(snapshot.settings ?? {}) };
  await Promise.all([
    saveSettings(mergedSettings),
    applyPortableMeta(snapshot)
  ]);

  return snapshot;
}

export async function buildPortableSyncPayload(options = {}) {
  const [settings, meta, tree] = await Promise.all([getSettings(), getMeta(), getLocalBookmarkTree()]);
  const savedAt = new Date().toISOString();
  const payload = {
    version: 3,
    savedAt,
    exportedAt: savedAt,
    app: "booki",
    settings,
    portableMeta: await buildPortableMeta(meta, tree),
    meta: {
      tagsByBookmarkId: meta.tagsByBookmarkId,
      starredIds: meta.starredIds,
      folderColorsById: meta.folderColorsById,
      folderEmojisById: meta.folderEmojisById,
      categoriesByBookmarkId: meta.categoriesByBookmarkId
    }
  };
  if (options.includeTree) {
    payload.folders = tree.folders;
    payload.bookmarks = tree.bookmarks;
  }
  return payload;
}

export async function applyPortableMeta(payload) {
  const [meta, tree] = await Promise.all([getMeta(), getLocalBookmarkTree()]);
  const incoming = payload?.portableMeta ?? await portableMetaFromLegacy(payload, tree);
  if (!incoming) return;

  const tagsByBookmarkId = { ...meta.tagsByBookmarkId };
  const categoriesByBookmarkId = { ...meta.categoriesByBookmarkId };
  const folderColorsById = { ...meta.folderColorsById };
  const folderEmojisById = { ...meta.folderEmojisById };
  const starred = new Set(meta.starredIds);

  for (const bookmark of tree.bookmarks) {
    const entry = incoming.bookmarksByUrl?.[await portableBookmarkKey(bookmark)];
    if (!entry) continue;
    if (Array.isArray(entry.tags)) {
      const tags = normalizeTags(entry.tags);
      if (tags.length) tagsByBookmarkId[bookmark.id] = tags;
      else delete tagsByBookmarkId[bookmark.id];
    }
    if (entry.category) categoriesByBookmarkId[bookmark.id] = entry.category;
    if (entry.starred) starred.add(bookmark.id);
  }

  for (const folder of tree.folders) {
    const path = await portableFolderPath(folder);
    const color = incoming.folderColorsByPath?.[path];
    const emoji = incoming.folderEmojisByPath?.[path];
    if (color) folderColorsById[folder.id] = color;
    if (emoji) folderEmojisById[folder.id] = emoji;
  }

  await saveMeta({
    ...meta,
    tagsByBookmarkId,
    starredIds: [...starred],
    folderColorsById,
    folderEmojisById,
    categoriesByBookmarkId
  });
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

export async function setFolderEmoji(folderId, emoji) {
  const meta = await getMeta();
  if (emoji) {
    meta.folderEmojisById[folderId] = emoji;
  } else {
    delete meta.folderEmojisById[folderId];
  }
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

export async function removeFolderEmoji(folderId) {
  const meta = await getMeta();
  delete meta.folderEmojisById[folderId];
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
  if (chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
  }
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
    emoji: meta.folderEmojisById[f.id] ?? "",
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

async function buildPortableMeta(meta, tree) {
  const starred = new Set(meta.starredIds ?? []);
  const bookmarksByUrl = {};
  const folderColorsByPath = {};
  const folderEmojisByPath = {};

  for (const bookmark of tree.bookmarks) {
    const tags = meta.tagsByBookmarkId?.[bookmark.id] ?? [];
    const category = meta.categoriesByBookmarkId?.[bookmark.id] ?? "";
    const isStarred = starred.has(bookmark.id);
    if (!tags.length && !category && !isStarred) continue;
    const key = await portableBookmarkKey(bookmark);
    const current = bookmarksByUrl[key] ?? { tags: [], starred: false, category: "" };
    bookmarksByUrl[key] = {
      tags: [...new Set([...current.tags, ...normalizeTags(tags)])],
      starred: current.starred || isStarred,
      category: category || current.category
    };
  }

  for (const folder of tree.folders) {
    const path = await portableFolderPath(folder);
    const color = meta.folderColorsById?.[folder.id];
    const emoji = meta.folderEmojisById?.[folder.id];
    if (color) folderColorsByPath[path] = color;
    if (emoji) folderEmojisByPath[path] = emoji;
  }

  return { algorithm: "sha256-url-path-ledger-v1", bookmarksByUrl, folderColorsByPath, folderEmojisByPath };
}

async function portableMetaFromLegacy(payload, tree) {
  const legacy = payload?.meta;
  if (!legacy) return null;
  return await buildPortableMeta({
    tagsByBookmarkId: legacy.tagsByBookmarkId ?? {},
    starredIds: legacy.starredIds ?? [],
    folderColorsById: legacy.folderColorsById ?? {},
    folderEmojisById: legacy.folderEmojisById ?? {},
    categoriesByBookmarkId: legacy.categoriesByBookmarkId ?? {}
  }, {
    bookmarks: payload?.bookmarks ?? tree.bookmarks,
    folders: payload?.folders ?? tree.folders
  });
}

async function writeChunkedSyncSnapshot(snapshot) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))));
  const chunks = [];
  for (let i = 0; i < encoded.length; i += SYNC_CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + SYNC_CHUNK_SIZE));
  }

  const previous = await chrome.storage.sync.get({ [SYNC_MANIFEST_KEY]: null });
  const oldKeys = previous[SYNC_MANIFEST_KEY]?.chunkKeys ?? [];
  if (oldKeys.length) await chrome.storage.sync.remove(oldKeys);

  const chunkKeys = chunks.map((_, i) => `${SYNC_CHUNK_PREFIX}${i}`);
  const data = {};
  chunks.forEach((chunk, i) => { data[chunkKeys[i]] = chunk; });
  data[SYNC_MANIFEST_KEY] = {
    version: snapshot.version,
    app: "booki",
    savedAt: snapshot.savedAt,
    chunkKeys
  };
  await chrome.storage.sync.set(data);
}

async function readChunkedSyncSnapshot() {
  const result = await chrome.storage.sync.get({ [SYNC_MANIFEST_KEY]: null, [SYNC_LEGACY_KEY]: null });
  const manifest = result[SYNC_MANIFEST_KEY];
  if (!manifest?.chunkKeys?.length) return result[SYNC_LEGACY_KEY] ?? null;

  const chunksResult = await chrome.storage.sync.get(manifest.chunkKeys);
  const chunks = manifest.chunkKeys.map((key) => chunksResult[key]);
  if (chunks.some((chunk) => typeof chunk !== "string")) throw new Error("Incomplete cloud sync snapshot.");
  return JSON.parse(decodeURIComponent(escape(atob(chunks.join("")))));
}

async function portableBookmarkKey(bookmark) {
  return `url:${await sha256Hex(canonicalUrl(bookmark.url))}`;
}

async function portableFolderPath(folder) {
  return `path:${await sha256Hex(folderPathKey(folder.path || folder.title || ""))}`;
}

export function folderPathKey(path) {
  return String(path || "").trim().replace(/\s*\/\s*/g, "/").toLowerCase();
}

export function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    const text = url.toString();
    return text.endsWith("/") ? text.slice(0, -1) : text;
  } catch {
    return String(value ?? "").trim().toLowerCase();
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cleanTag(tag) {
  return String(tag ?? "").trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-").slice(0, 32);
}
