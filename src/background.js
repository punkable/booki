import {
  applyPortableMeta,
  buildPortableSyncPayload,
  createBookmark,
  getCurrentTab,
  openSidePanelForCurrentWindow,
  getMeta,
  saveMeta,
  getSettings,
  getLocalBookmarkTree,
  canonicalUrl,
  folderPathKey,
  getBackupState,
  setBackupState
} from "./shared.js";

/* ─── Init ─── */

chrome.runtime.onInstalled.addListener(async () => {
  await setupContextMenus();
  await setupSidePanelBehavior();
  await buildBookmarkIndex();
  chrome.alarms?.create?.("check-dead-links", { periodInMinutes: 1440 });
  chrome.alarms?.create?.("auto-backup", { periodInMinutes: 720 });
  await checkDeadLinks();
  updateDeadLinkBadge();
  runAutoBackupIfDue();
});

async function setupContextMenus() {
  if (!chrome.contextMenus?.create) return;
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: "save-to-booki",
      title: "Save to Booki",
      contexts: ["page", "link"]
    });
    chrome.contextMenus.create({
      id: "save-all-tabs-to-booki",
      title: "Save all tabs to Booki Inbox",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "open-booki",
      title: "Open Booki",
      contexts: ["action"]
    });
  } catch {
    /* Some Chromium forks expose partial context menu support. */
  }
}

async function setupSidePanelBehavior() {
  try {
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
  } catch {
    /* The tab fallback in shared.js keeps Booki usable without sidePanel. */
  }
}

/* ─── Bookmark index (live cache) ─── */

const BOOKMARK_INDEX_KEY = "bookiIndex";

async function buildBookmarkIndex() {
  try {
    const [root] = await chrome.bookmarks.getTree();
    const index = { folders: [], bookmarks: [] };
    walkBookmarks(root, [], index.folders, index.bookmarks);
    await chrome.storage.local.set({ [BOOKMARK_INDEX_KEY]: index });
    return index;
  } catch {
    return { folders: [], bookmarks: [] };
  }
}

function walkBookmarks(node, path, folders, bookmarks) {
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
    node.children.forEach((child) => walkBookmarks(child, nextPath, folders, bookmarks));
    return;
  }
  bookmarks.push({
    id: node.id,
    parentId: node.parentId,
    title: node.title || node.url,
    url: node.url,
    dateAdded: node.dateAdded,
    folderPath: path.join(" / ") || "Bookmarks"
  });
}

async function getBookmarkIndex() {
  const result = await chrome.storage.local.get({ [BOOKMARK_INDEX_KEY]: null });
  if (result[BOOKMARK_INDEX_KEY]) return result[BOOKMARK_INDEX_KEY];
  return buildBookmarkIndex();
}

/* ─── Live bookmark watchers ─── */

chrome.bookmarks.onCreated.addListener(async () => {
  await buildBookmarkIndex();
  notifyPanels("bookmarks-changed");
});

chrome.bookmarks.onChanged.addListener(async () => {
  await buildBookmarkIndex();
  notifyPanels("bookmarks-changed");
});

chrome.bookmarks.onRemoved.addListener(async () => {
  await buildBookmarkIndex();
  await cleanupMetaForRemoved();
  notifyPanels("bookmarks-changed");
});

chrome.bookmarks.onMoved.addListener(async () => {
  await buildBookmarkIndex();
  notifyPanels("bookmarks-changed");
});

async function cleanupMetaForRemoved() {
  const meta = await getMeta();
  const index = await getBookmarkIndex();
  const validIds = new Set(index.bookmarks.map((b) => b.id));
  let changed = false;
  for (const id of Object.keys(meta.tagsByBookmarkId)) {
    if (!validIds.has(id)) { delete meta.tagsByBookmarkId[id]; changed = true; }
  }
  for (const id of Object.keys(meta.deadLinks || {})) {
    if (!validIds.has(id)) { delete meta.deadLinks[id]; changed = true; }
  }
  for (const id of Object.keys(meta.pageContent || {})) {
    if (!validIds.has(id)) { delete meta.pageContent[id]; changed = true; }
  }
  meta.starredIds = meta.starredIds.filter((id) => validIds.has(id));
  if (meta.starredIds.length !== (await getMeta()).starredIds.length) changed = true;
  for (const id of Object.keys(meta.categoriesByBookmarkId)) {
    if (!validIds.has(id)) { delete meta.categoriesByBookmarkId[id]; changed = true; }
  }
  if (changed) await saveMeta(meta);
}

/* ─── Dead link checker ─── */

chrome.alarms?.onAlarm?.addListener(async (alarm) => {
  if (alarm.name === "check-dead-links") await checkDeadLinks();
  if (alarm.name === "auto-backup") await runAutoBackupIfDue();
});

/* ─── Scheduled auto-backup ─── */

const BACKUP_INTERVAL_DAYS = { weekly: 7, monthly: 30 };

async function runAutoBackupIfDue() {
  try {
    const settings = await getSettings();
    const days = BACKUP_INTERVAL_DAYS[settings.autoBackupInterval];
    if (!days) return;
    if (!chrome.downloads?.download) return;
    const state = await getBackupState();
    const due = Date.now() - (state.lastBackupAt || 0) > days * 86400000;
    if (!due) return;

    const { json, filename } = await exportSyncFile();
    const dataUrl = "data:application/json;base64," + btoa(unescape(encodeURIComponent(json)));
    await chrome.downloads.download({
      url: dataUrl,
      filename: `Booki Backups/${filename}`,
      saveAs: false,
      conflictAction: "uniquify"
    });
    await setBackupState({ lastBackupAt: Date.now() });
  } catch { /* downloads may be blocked; reminder still nudges the user */ }
}

async function checkDeadLinks() {
  const index = await getBookmarkIndex();
  const meta = await getMeta();
  const deadLinks = meta.deadLinks || {};
  const batch = index.bookmarks.filter((b) => {
    if (!b.url) return false;
    const last = deadLinks[b.id]?.checked || 0;
    return Date.now() - last > 86400000;
  }).slice(0, 50);

  for (const b of batch) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(b.url, { method: "HEAD", signal: controller.signal, mode: "no-cors" });
      clearTimeout(t);
      deadLinks[b.id] = { ok: true, status: res.status, checked: Date.now() };
    } catch {
      deadLinks[b.id] = { ok: false, status: 0, checked: Date.now() };
    }
  }
  meta.deadLinks = deadLinks;
  await saveMeta(meta);
  updateDeadLinkBadge();
  if (batch.length) notifyPanels("bookmarks-changed");
}

/* ─── OmniBox ─── */

chrome.omnibox?.onInputChanged?.addListener(async (text, suggest) => {
  if (!text.trim()) return;
  const index = await getBookmarkIndex();
  const q = text.toLowerCase();
  const results = index.bookmarks
    .filter((b) => (b.title + " " + b.url).toLowerCase().includes(q))
    .slice(0, 5);
  suggest(results.map((b) => ({
    content: b.url,
    description: `${b.title} — <url>${b.url}</url>`
  })));
});

chrome.omnibox?.onInputEntered?.addListener((url, disposition) => {
  if (!url) return;
  if (!url.startsWith("http")) url = "https://" + url;
  if (disposition === "currentTab") chrome.tabs.update({ url });
  else chrome.tabs.create({ url });
});

/* ─── Context menus ─── */

chrome.contextMenus?.onClicked?.addListener(async (info, tab) => {
  if (info.menuItemId === "open-booki") {
    await openSidePanelForCurrentWindow();
    return;
  }
  if (info.menuItemId === "save-all-tabs-to-booki") {
    await saveAllTabsToInbox();
    return;
  }
  if (info.menuItemId === "save-to-booki") {
    const url = info.linkUrl || tab?.url;
    const title = info.linkText || tab?.title || url;
    if (!url) return;
    await createBookmark({ title, url, parentId: "1", tags: [] });
  }
});

async function saveAllTabsToInbox() {
  const folder = await findOrCreateFolder("Booki Inbox");
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const existingUrls = new Set((await getBookmarkIndex()).bookmarks.map((b) => b.url));
  for (const tab of tabs) {
    if (!tab.url || !/^https?:/i.test(tab.url) || existingUrls.has(tab.url)) continue;
    try {
      await createBookmark({ title: tab.title || tab.url, url: tab.url, parentId: folder.id, tags: ["inbox"] });
      existingUrls.add(tab.url);
    } catch {}
  }
  await buildBookmarkIndex();
  notifyPanels("bookmarks-changed");
}

async function findOrCreateFolder(title) {
  const index = await getBookmarkIndex();
  const existing = index.folders.find((folder) => folder.title.toLowerCase() === title.toLowerCase());
  if (existing) return existing;
  return chrome.bookmarks.create({ parentId: "1", title });
}

/* ─── Content capture (read-later) ─── */

async function capturePageContent(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error("Fetch failed");
    const html = await res.text();
    const text = extractReadableText(html);
    return text.slice(0, 50000);
  } catch {
    return null;
  }
}

function extractReadableText(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = match ? match[1] : html;
  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 50000);
}

/* ─── Commands ─── */

chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === "open-studio") {
    const { getSettings } = await import("./shared.js");
    const settings = await getSettings();
    if (settings.openInTab) {
      chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
    } else {
      await openSidePanelForCurrentWindow();
    }
  }
});

/* ─── Cross-device sync helpers ─── */

export async function buildSyncPayload() {
  return buildPortableSyncPayload({ includeTree: true });
}

export async function exportSyncFile() {
  const payload = await buildSyncPayload();
  payload.kind = "full-backup";
  payload.counts = {
    bookmarks: (payload.bookmarks ?? []).length,
    folders: (payload.folders ?? []).length
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return { json: JSON.stringify(payload, null, 2), filename: `booki-backup-${stamp}.json` };
}

const BOOKI_FOLDER_NAME = "Booki";

/* Idempotent restore with two destinations:
   - "merge"  (default): rebuilds the backup's folders by path and skips any
     bookmark whose URL already exists anywhere, so it blends into your library
     without ever duplicating.
   - "booki-folder": puts everything inside a single top-level "Booki" folder,
     mirroring the backup's tree there. Duplicates are only checked inside that
     folder, so imported copies stay isolated from your bookmarks bar.
   Either way, re-importing the same file never piles up duplicates.
   Returns stats so the UI can report exactly what happened. */
export async function restoreFromPayload(payload, options = {}) {
  if (!payload || payload.app !== "booki") throw new Error("Invalid Booki file");
  const mode = options.mode === "booki-folder" ? "booki-folder" : "merge";
  const dryRun = !!options.dryRun;
  const stats = { foldersCreated: 0, foldersReused: 0, bookmarksCreated: 0, bookmarksSkipped: 0, mode, dryRun };

  const payloadFolders = payload.folders ?? [];
  const payloadBookmarks = payload.bookmarks ?? [];
  const localTree = await getLocalBookmarkTree();
  const localFolderIdByPath = new Map(localTree.folders.map((f) => [folderPathKey(f.path), f.id]));
  const simulatedFolderKeys = new Set();

  /* Resolve the base container and the path prefix used to match/create. */
  let baseParentId = "1";
  let pathPrefix = "";
  let existingUrls;
  if (mode === "booki-folder") {
    const existingBooki = localTree.folders.find((f) => folderPathKey(f.path) === folderPathKey(BOOKI_FOLDER_NAME));
    if (existingBooki) {
      baseParentId = existingBooki.id;
    } else if (dryRun) {
      baseParentId = "sim:booki";
      stats.foldersCreated += 1;
    } else {
      const created = await chrome.bookmarks.create({ parentId: "1", title: BOOKI_FOLDER_NAME });
      baseParentId = created.id;
      localFolderIdByPath.set(folderPathKey(BOOKI_FOLDER_NAME), created.id);
      stats.foldersCreated += 1;
    }
    pathPrefix = `${BOOKI_FOLDER_NAME} / `;
    /* only consider duplicates already living inside the Booki folder */
    const bookiKey = folderPathKey(BOOKI_FOLDER_NAME);
    const bookiFolderIds = new Set(
      localTree.folders
        .filter((f) => { const k = folderPathKey(f.path); return k === bookiKey || k.startsWith(`${bookiKey}/`); })
        .map((f) => f.id)
    );
    bookiFolderIds.add(baseParentId);
    existingUrls = new Set(localTree.bookmarks.filter((b) => bookiFolderIds.has(b.parentId)).map((b) => canonicalUrl(b.url)));
  } else {
    existingUrls = new Set(localTree.bookmarks.map((b) => canonicalUrl(b.url)));
  }

  const payloadById = new Map(payloadFolders.map((f) => [f.id, f]));
  const idMap = new Map();
  /* payload roots resolve to the base container */
  for (const rootId of ["0", "1", "2", "3"]) {
    idMap.set(rootId, mode === "booki-folder" ? baseParentId : (rootId === "0" ? "1" : rootId));
  }

  function pathFor(folder) {
    if (folder.path) return folder.path;
    const parts = [];
    const seen = new Set();
    let cur = folder;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (!["0", "1", "2", "3"].includes(cur.id)) parts.unshift(cur.title);
      cur = payloadById.get(cur.parentId);
    }
    return parts.filter(Boolean).join(" / ");
  }

  /* create/reuse folders shallow-first so parents exist before children */
  const sortedFolders = [...payloadFolders]
    .filter((f) => !["0", "1", "2", "3"].includes(f.id))
    .sort((a, b) => (pathFor(a).split("/").length) - (pathFor(b).split("/").length));

  for (const folder of sortedFolders) {
    const key = folderPathKey(pathPrefix + pathFor(folder));
    const existingId = localFolderIdByPath.get(key);
    if (existingId) { idMap.set(folder.id, existingId); stats.foldersReused += 1; continue; }
    if (dryRun) {
      if (!simulatedFolderKeys.has(key)) { simulatedFolderKeys.add(key); stats.foldersCreated += 1; }
      idMap.set(folder.id, `sim:${key}`);
      continue;
    }
    const localParent = idMap.get(folder.parentId) || baseParentId;
    try {
      const created = await chrome.bookmarks.create({ parentId: localParent, title: folder.title });
      idMap.set(folder.id, created.id);
      localFolderIdByPath.set(key, created.id);
      stats.foldersCreated += 1;
    } catch {
      idMap.set(folder.id, localParent);
    }
  }

  for (const bm of payloadBookmarks) {
    if (!bm.url) continue;
    const canon = canonicalUrl(bm.url);
    if (existingUrls.has(canon)) { stats.bookmarksSkipped += 1; continue; }
    if (dryRun) { existingUrls.add(canon); stats.bookmarksCreated += 1; continue; }
    const parentId = idMap.get(bm.parentId) || baseParentId;
    try {
      await createBookmark({ title: bm.title, url: bm.url, parentId, tags: payload.meta?.tagsByBookmarkId?.[bm.id] || [] });
      existingUrls.add(canon);
      stats.bookmarksCreated += 1;
    } catch {}
  }

  if (dryRun) return stats;

  await buildBookmarkIndex();
  await applyPortableMeta(payload);
  return stats;
}

/* ─── Generate sync code ─── */

const CHUNK_PREFIX = "bookiChunk_";
const CODE_INDEX_KEY = "bookiCodeIndex";
const CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_CHUNK_SIZE = 6000;

/* chrome.storage.sync gives ~100KB total; a code that carries the full tree
   must fit. Beyond this we tell the user to use a backup file instead. */
const CODE_MAX_ENCODED = 90000;

export async function generateSyncCode() {
  /* include the bookmark tree so a fresh browser actually receives the
     bookmarks, not just the metadata */
  const payload = await buildPortableSyncPayload({ includeTree: true });
  const encoded = encodePayload(payload);
  if (encoded.length > CODE_MAX_ENCODED) {
    throw new Error("Your library is too large for a sync code. Use “Export backup file” instead — it has no size limit.");
  }
  const sha256 = await sha256Hex(encoded);
  const code = generateShortCode();
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CODE_CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CODE_CHUNK_SIZE));
  }
  const chunkKeys = chunks.map((_, i) => CHUNK_PREFIX + code + "_" + i);
  const createdAt = Date.now();
  const store = {};
  chunks.forEach((chunk, i) => { store[chunkKeys[i]] = chunk; });
  store[CHUNK_PREFIX + code] = {
    version: 3,
    app: "booki",
    algorithm: "portable-url-path-ledger-v1",
    createdAt,
    expiresAt: createdAt + CODE_TTL_MS,
    chunks: chunks.length,
    chunkKeys,
    sha256
  };
  const entries = Object.entries(store);
  for (let i = 0; i < entries.length; i += 10) {
    const batch = Object.fromEntries(entries.slice(i, i + 10));
    await chrome.storage.sync.set(batch);
  }
  const idx = await chrome.storage.sync.get({ [CODE_INDEX_KEY]: [] });
  const index = [...idx[CODE_INDEX_KEY]].filter((entry) => !entry.expiresAt || entry.expiresAt > Date.now());
  index.push({ code, time: createdAt, expiresAt: createdAt + CODE_TTL_MS, chunks: chunks.length, sha256 });
  const recent = index.slice(-12);
  await chrome.storage.sync.set({ [CODE_INDEX_KEY]: recent });
  return { code, expiresAt: createdAt + CODE_TTL_MS, sha256 };
}

export async function restoreFromCode(code, options = {}) {
  const clean = code.trim().toUpperCase();
  const manifestKey = CHUNK_PREFIX + clean;
  const stored = await chrome.storage.sync.get(manifestKey);
  const manifest = stored[manifestKey];
  const legacyManifest = typeof manifest === "string";
  const chunkCount = legacyManifest ? parseInt(manifest, 10) : Number(manifest?.chunks);
  if (!chunkCount || isNaN(chunkCount)) throw new Error("Code not found. Generate it first on your source device (same Google account).");
  if (!legacyManifest && manifest.expiresAt && manifest.expiresAt < Date.now()) throw new Error("This sync code has expired. Generate a new one on the source device.");
  const keys = legacyManifest ? Array.from({ length: chunkCount }, (_, i) => CHUNK_PREFIX + clean + "_" + i) : manifest.chunkKeys;
  const result = await chrome.storage.sync.get(keys);
  const parts = keys.map(k => result[k]);
  if (parts.some(p => !p)) throw new Error("Incomplete sync data. Try generating the code again.");
  const encoded = parts.join("");
  if (!legacyManifest && manifest.sha256 && await sha256Hex(encoded) !== manifest.sha256) throw new Error("Sync data integrity check failed. Generate the code again.");
  const payload = decodePayload(encoded);
  return restoreFromPayload(payload, options);
}

function generateShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) code += chars[byte % chars.length];
  return code;
}

function encodePayload(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function decodePayload(encoded) {
  return JSON.parse(decodeURIComponent(escape(atob(encoded))));
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ─── GitHub Gist sync (private, per-user token — no app verification) ─── */

const GIST_FILENAME = "booki-backup.json";
const GIST_STATE_KEY = "bookiGist";

async function getGistConfig() {
  const result = await chrome.storage.local.get({ [GIST_STATE_KEY]: {} });
  return result[GIST_STATE_KEY] || {};
}

async function setGistConfig(patch) {
  const current = await getGistConfig();
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value;
  }
  await chrome.storage.local.set({ [GIST_STATE_KEY]: next });
  return next;
}

function gistHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

async function gistError(res) {
  if (res.status === 401) return "Invalid GitHub token (it needs the 'gist' scope).";
  if (res.status === 403) return "GitHub denied the request (rate limit or missing 'gist' scope).";
  if (res.status === 404) return "Gist not found. Check the Gist ID.";
  let detail = "";
  try { detail = (await res.json())?.message || ""; } catch {}
  return `GitHub error ${res.status}${detail ? ": " + detail : ""}.`;
}

export async function gistPush() {
  const { token, gistId } = await getGistConfig();
  if (!token) throw new Error("Add a GitHub token first.");
  const { json } = await exportSyncFile();
  const body = JSON.stringify({
    description: "Booki bookmarks backup",
    public: false,
    files: { [GIST_FILENAME]: { content: json } }
  });
  const target = gistId ? `https://api.github.com/gists/${gistId}` : "https://api.github.com/gists";
  let res = await fetch(target, { method: gistId ? "PATCH" : "POST", headers: gistHeaders(token), body });
  if (res.status === 404 && gistId) {
    /* the saved gist was deleted remotely — create a fresh one */
    res = await fetch("https://api.github.com/gists", { method: "POST", headers: gistHeaders(token), body });
  }
  if (!res.ok) throw new Error(await gistError(res));
  const data = await res.json();
  await setGistConfig({ gistId: data.id, lastPushAt: Date.now() });
  return { gistId: data.id, url: data.html_url };
}

export async function gistPull(options = {}) {
  const { token, gistId } = await getGistConfig();
  if (!token) throw new Error("Add a GitHub token first.");
  if (!gistId) throw new Error("No Gist linked yet. Push from another device, then paste its Gist ID here.");
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: gistHeaders(token) });
  if (!res.ok) throw new Error(await gistError(res));
  const data = await res.json();
  const file = data.files?.[GIST_FILENAME];
  if (!file) throw new Error("This Gist has no Booki backup file.");
  let content = file.content;
  if (file.truncated && file.raw_url) content = await (await fetch(file.raw_url)).text();
  const payload = JSON.parse(content);
  return restoreFromPayload(payload, options);
}

/* ─── Dead link badge ─── */

async function updateDeadLinkBadge() {
  try {
    if (!chrome.action?.setBadgeText) return;
    const settings = await getSettings();
    if (!settings.deadLinkBadge) { chrome.action.setBadgeText({ text: "" }); return; }
    const meta = await getMeta();
    const deadLinks = meta.deadLinks || {};
    const count = Object.values(deadLinks).filter((d) => d.ok === false).length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor?.({ color: "#fb5607" });
  } catch { /* background may not be fully ready */ }
}

/* ─── Notify panels ─── */

function notifyPanels(type) {
  chrome.runtime.sendMessage({ type }).catch(() => {});
}

/* ─── Messages ─── */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "save-current-tab") {
    handleSaveCurrentTab(message.tags, message.parentId)
      .then((bookmark) => sendResponse({ ok: true, bookmark }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "open-side-panel") {
    openSidePanelForCurrentWindow()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "get-bookmark-index") {
    getBookmarkIndex().then((index) => sendResponse({ ok: true, index })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "export-booki") {
    exportSyncFile().then((result) => sendResponse({ ok: true, ...result })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "generate-sync-code") {
    generateSyncCode().then((result) => sendResponse({ ok: true, ...result })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "restore-from-code") {
    restoreFromCode(message.code, { mode: message.mode }).then((stats) => sendResponse({ ok: true, stats })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "restore-from-file") {
    restoreFromPayload(message.payload, { mode: message.mode, dryRun: message.dryRun }).then((stats) => sendResponse({ ok: true, stats })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "gist-status") {
    getGistConfig().then((c) => sendResponse({ ok: true, hasToken: !!c.token, gistId: c.gistId || "", lastPushAt: c.lastPushAt || 0 })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "gist-save") {
    setGistConfig({ token: message.token, gistId: message.gistId }).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "gist-push") {
    gistPush().then((r) => sendResponse({ ok: true, ...r })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "gist-pull") {
    gistPull({ mode: message.mode, dryRun: message.dryRun }).then((stats) => sendResponse({ ok: true, stats })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "capture-content") {
    capturePageContent(message.url).then((content) => sendResponse({ ok: true, content })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "check-dead-links") {
    checkDeadLinks().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "settings-changed") {
    /* relay to all extension pages (options→sidepanel bridge) */
    chrome.runtime.sendMessage({ type: "settings-changed-broadcast", settings: message.settings }).catch(() => {});
    return false;
  }

  return false;
});

async function handleSaveCurrentTab(tags, parentId) {
  const tab = await getCurrentTab();
  if (!tab?.url) throw new Error("No active tab found.");
  const existing = await chrome.bookmarks.search({ url: tab.url });
  if (existing[0]) {
    const { normalizeTags, setTags } = await import("./shared.js");
    const targetParentId = parentId || existing[0].parentId || "1";
    const cleanTags = String(tags ?? "").trim();
    if (cleanTags) {
      const meta = await getMeta();
      const mergedTags = [...new Set([...(meta.tagsByBookmarkId?.[existing[0].id] ?? []), ...normalizeTags(cleanTags)])];
      await setTags(existing[0].id, mergedTags);
    }
    if (targetParentId && existing[0].parentId !== targetParentId) {
      await chrome.bookmarks.move(existing[0].id, { parentId: targetParentId });
    }
    await buildBookmarkIndex();
    notifyPanels("bookmarks-changed");
    return { ...existing[0], parentId: targetParentId, alreadyExisted: true, moved: existing[0].parentId !== targetParentId };
  }
  const bookmark = await createBookmark({ title: tab.title || tab.url, url: tab.url, parentId: parentId || "1", tags });
  await buildBookmarkIndex();
  notifyPanels("bookmarks-changed");
  return { ...bookmark, alreadyExisted: false, moved: false };
}
