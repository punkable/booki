import { createBookmark, getCurrentTab, openSidePanelForCurrentWindow, removeBookmarkMeta, getMeta, saveMeta, getSettings } from "./shared.js";

/* ─── Init ─── */

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "save-to-booki",
    title: "Save to Booki",
    contexts: ["page", "link"]
  });

  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  await buildBookmarkIndex();
  chrome.alarms.create("check-dead-links", { periodInMinutes: 1440 });
  await checkDeadLinks();
  updateDeadLinkBadge();
});

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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "check-dead-links") await checkDeadLinks();
});

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

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
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

chrome.omnibox.onInputEntered.addListener((url, disposition) => {
  if (!url) return;
  if (!url.startsWith("http")) url = "https://" + url;
  if (disposition === "currentTab") chrome.tabs.update({ url });
  else chrome.tabs.create({ url });
});

/* ─── Context menus ─── */

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-booki") return;
  const url = info.linkUrl || tab?.url;
  const title = info.linkText || tab?.title || url;
  if (!url) return;
  await createBookmark({ title, url, parentId: "1", tags: [] });
});

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

chrome.commands.onCommand.addListener(async (command) => {
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

const SYNC_KEY = "bookiSyncData";

export async function buildSyncPayload() {
  const index = await getBookmarkIndex();
  const meta = await getMeta();
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: "booki",
    folders: index.folders,
    bookmarks: index.bookmarks,
    meta: {
      tagsByBookmarkId: meta.tagsByBookmarkId || {},
      starredIds: meta.starredIds || [],
      folderColorsById: meta.folderColorsById || {},
      categoriesByBookmarkId: meta.categoriesByBookmarkId || {}
    }
  };
}

export async function exportSyncFile() {
  const payload = await buildSyncPayload();
  return { json: JSON.stringify(payload, null, 2), filename: `booki-export-${Date.now()}.json` };
}

export async function restoreFromPayload(payload) {
  if (!payload || payload.app !== "booki") throw new Error("Invalid Booki file");
  const bookmarkMap = new Map();
  async function createFolderTree(folders) {
    const rootFolders = folders.filter((f) => f.parentId === "1" || f.parentId === "0" || f.parentId === "2" || f.parentId === "3");
    for (const f of rootFolders) {
      const created = await chrome.bookmarks.create({ parentId: f.parentId, title: f.title });
      bookmarkMap.set(f.id, created.id);
      await createChildFolders(f.id, folders);
    }
  }
  async function createChildFolders(parentId, folders) {
    const children = folders.filter((f) => f.parentId === parentId);
    for (const f of children) {
      const mappedParent = bookmarkMap.get(parentId) || parentId;
      const created = await chrome.bookmarks.create({ parentId: mappedParent, title: f.title });
      bookmarkMap.set(f.id, created.id);
      await createChildFolders(f.id, folders);
    }
  }
  async function restoreBookmarks() {
    for (const bm of payload.bookmarks) {
      const parentId = bookmarkMap.get(bm.parentId) || bm.parentId || "1";
      try { await createBookmark({ title: bm.title, url: bm.url, parentId, tags: payload.meta?.tagsByBookmarkId?.[bm.id] || [] }); } catch {}
    }
  }
  await createFolderTree(payload.folders);
  await restoreBookmarks();
  if (payload.meta?.starredIds?.length) {
    const newMeta = await getMeta();
    newMeta.starredIds = [...new Set([...newMeta.starredIds, ...payload.meta.starredIds])];
    if (payload.meta.folderColorsById) Object.assign(newMeta.folderColorsById, payload.meta.folderColorsById);
    if (payload.meta.categoriesByBookmarkId) Object.assign(newMeta.categoriesByBookmarkId, payload.meta.categoriesByBookmarkId);
    await saveMeta(newMeta);
  }
  await buildBookmarkIndex();
}

/* ─── Generate sync code ─── */

const CHUNK_PREFIX = "bookiChunk_";
const CODE_INDEX_KEY = "bookiCodeIndex";

export async function generateSyncCode() {
  const payload = await buildSyncPayload();
  const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
  const code = generateShortCode();
  const CHUNK_SIZE = 6000;
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  }
  const chunkKeys = chunks.map((_, i) => CHUNK_PREFIX + code + "_" + i);
  const store = {};
  chunks.forEach((chunk, i) => { store[chunkKeys[i]] = chunk; });
  store[CHUNK_PREFIX + code] = chunks.length.toString();
  const entries = Object.entries(store);
  for (let i = 0; i < entries.length; i += 10) {
    const batch = Object.fromEntries(entries.slice(i, i + 10));
    await chrome.storage.sync.set(batch);
  }
  const idx = await chrome.storage.sync.get({ [CODE_INDEX_KEY]: [] });
  const index = [...idx[CODE_INDEX_KEY]];
  index.push({ code, time: Date.now(), chunks: chunks.length });
  const recent = index.slice(-20);
  await chrome.storage.sync.set({ [CODE_INDEX_KEY]: recent });
  return { code, data: encoded };
}

export async function restoreFromCode(code) {
  const clean = code.trim().toUpperCase();
  const manifestKey = CHUNK_PREFIX + clean;
  const manifest = await chrome.storage.sync.get(manifestKey);
  const chunkCount = parseInt(manifest[manifestKey], 10);
  if (!chunkCount || isNaN(chunkCount)) throw new Error("Code not found. Generate it first on your source device (same Google account).");
  const keys = Array.from({ length: chunkCount }, (_, i) => CHUNK_PREFIX + clean + "_" + i);
  const result = await chrome.storage.sync.get(keys);
  const parts = keys.map(k => result[k]);
  if (parts.some(p => !p)) throw new Error("Incomplete sync data. Try generating the code again.");
  const encoded = parts.join("");
  const json = decodeURIComponent(atob(encoded));
  const payload = JSON.parse(json);
  await restoreFromPayload(payload);
  return payload;
}

function generateShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/* ─── Dead link badge ─── */

async function updateDeadLinkBadge() {
  try {
    const settings = await getSettings();
    if (!settings.deadLinkBadge) { chrome.action.setBadgeText({ text: "" }); return; }
    const meta = await getMeta();
    const deadLinks = meta.deadLinks || {};
    const count = Object.values(deadLinks).filter((d) => d.ok === false).length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#fb5607" });
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
    restoreFromCode(message.code).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
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

  if (message?.type === "get-bookmark-index-full") {
    getBookmarkIndex().then((index) => {
      const meta = getMeta();
      return Promise.all([index, meta]);
    }).then(([index, meta]) => sendResponse({ ok: true, index, meta })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "settings-changed") {
    /* relay to all extension pages (options→sidepanel bridge) */
    chrome.runtime.sendMessage({ type: "settings-changed" }).catch(() => {});
    return false;
  }

  return false;
});

async function handleSaveCurrentTab(tags, parentId) {
  const tab = await getCurrentTab();
  if (!tab?.url) throw new Error("No active tab found.");
  const existing = await chrome.bookmarks.search({ url: tab.url });
  if (existing[0]) {
    const { setTags } = await import("./shared.js");
    await setTags(existing[0].id, tags);
    return existing[0];
  }
  return createBookmark({ title: tab.title || tab.url, url: tab.url, parentId: parentId || "1", tags });
}
