/* Booki settings window — edit appearance, behavior and pinned apps.
   Changes are saved immediately and broadcast so the dock live-refreshes. */

import {
  config as configApi,
  dock as dockApi,
  pickAppFile,
  emitConfigChanged,
  closeSelf,
  logMessage,
} from "./api.js";
import { applyTheme } from "./theme.js";

window.addEventListener("error", (e) => logMessage("error", `settings: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `settings: unhandled ${e.reason}`)
);

const ACCENTS = [
  { name: "Tan (Booki)", value: "#dfaa75" },
  { name: "Ámbar", value: "#ffbe0b" },
  { name: "Naranja", value: "#fb5607" },
  { name: "Rosa", value: "#ff006e" },
  { name: "Violeta", value: "#8338ec" },
  { name: "Azul", value: "#3a86ff" },
];

const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);
let cfg = null;

async function boot() {
  try {
    cfg = await configApi.get();
    applyTheme(cfg);
    buildSwatches();
    bind();
    syncForm();
    renderPins();
    dockApi.appVersion().then((v) => {
      $("version").textContent = `v${v}`;
    });
  } catch (err) {
    logMessage("error", `settings boot failed: ${err}`);
  }
}

function buildSwatches() {
  const wrap = $("swatches");
  wrap.innerHTML = "";
  for (const a of ACCENTS) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = a.value;
    b.title = a.name;
    b.dataset.value = a.value;
    b.addEventListener("click", () => update({ accent: a.value }));
    wrap.appendChild(b);
  }
}

function syncForm() {
  $("theme").value = cfg.theme || "system";
  $("edge").value = cfg.edge || "bottom";
  $("iconSize").value = cfg.iconSize || 48;
  $("iconSizeVal").textContent = `${cfg.iconSize || 48}px`;
  $("spacing").value = cfg.spacing ?? 6;
  $("spacingVal").textContent = `${cfg.spacing ?? 6}px`;
  $("opacity").value = Math.round((cfg.opacity ?? 0.62) * 100);
  $("opacityVal").textContent = `${Math.round((cfg.opacity ?? 0.62) * 100)}%`;
  $("zoom").value = Math.round((cfg.zoom ?? 1.8) * 100);
  $("zoomVal").textContent = `${Math.round((cfg.zoom ?? 1.8) * 100)}%`;
  $("magnification").checked = !!cfg.magnification;
  $("zoomRow").style.opacity = cfg.magnification ? "1" : "0.4";
  $("showLabels").checked = cfg.showLabels !== false;
  $("showIndicators").checked = cfg.showIndicators !== false;
  $("alwaysOnTop").checked = !!cfg.alwaysOnTop;
  $("autoHide").checked = !!cfg.autoHide;
  document.querySelectorAll(".swatch").forEach((s) => {
    s.classList.toggle("active", s.dataset.value === cfg.accent);
  });
}

function bind() {
  $("theme").addEventListener("change", (e) => update({ theme: e.target.value }));
  $("edge").addEventListener("change", (e) => update({ edge: e.target.value }));
  $("iconSize").addEventListener("input", (e) => update({ iconSize: Number(e.target.value) }));
  $("spacing").addEventListener("input", (e) => update({ spacing: Number(e.target.value) }));
  $("opacity").addEventListener("input", (e) =>
    update({ opacity: Number(e.target.value) / 100 })
  );
  $("zoom").addEventListener("input", (e) => update({ zoom: Number(e.target.value) / 100 }));
  $("magnification").addEventListener("change", (e) =>
    update({ magnification: e.target.checked })
  );
  $("showLabels").addEventListener("change", (e) => update({ showLabels: e.target.checked }));
  $("showIndicators").addEventListener("change", (e) =>
    update({ showIndicators: e.target.checked })
  );
  $("alwaysOnTop").addEventListener("change", (e) => {
    update({ alwaysOnTop: e.target.checked });
    dockApi.setAlwaysOnTop(e.target.checked);
  });
  $("autoHide").addEventListener("change", (e) => update({ autoHide: e.target.checked }));
  $("addApp").addEventListener("click", onAddApp);
  $("addSep").addEventListener("click", onAddSeparator);
  $("resetCfg").addEventListener("click", onReset);
  $("quitApp").addEventListener("click", () => dockApi.quit());
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSelf();
  });
}

async function onReset() {
  const fresh = await configApi.reset();
  if (fresh) cfg = fresh;
  applyTheme(cfg);
  syncForm();
  renderPins();
  await emitConfigChanged();
}

async function update(patch) {
  Object.assign(cfg, patch);
  applyTheme(cfg);
  syncForm();
  await save();
}

async function save() {
  await configApi.save(cfg);
  await emitConfigChanged();
}

function renderPins() {
  const list = $("pinList");
  list.innerHTML = "";
  if (!cfg.pinned.length) {
    const empty = document.createElement("li");
    empty.className = "pin-empty";
    empty.textContent = "Aún no hay nada anclado. Añade apps o arrástralas desde el escritorio.";
    list.appendChild(empty);
    return;
  }
  cfg.pinned.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "pin-item" + (item.kind === "separator" ? " sep" : "");

    const left = document.createElement("span");
    left.className = "pin-left";
    if (item.kind !== "separator") left.appendChild(pinThumb(item));

    const name = document.createElement("span");
    name.className = "pin-name";
    name.textContent = item.kind === "separator" ? "— separador —" : item.name;
    name.title = item.path || "";
    left.appendChild(name);

    const actions = document.createElement("span");
    actions.className = "pin-actions";
    actions.appendChild(moveBtn("▲", i > 0, () => move(i, i - 1)));
    actions.appendChild(moveBtn("▼", i < cfg.pinned.length - 1, () => move(i, i + 1)));
    actions.appendChild(moveBtn("✕", true, () => removePin(i), "del"));

    li.append(left, actions);
    list.appendChild(li);
  });
}

function pinThumb(item) {
  const thumb = document.createElement("span");
  thumb.className = "pin-thumb";
  thumb.textContent = (item.name || "?").trim().charAt(0).toUpperCase();
  const src = item.icon ? Promise.resolve(item.icon) : dockApi.appIcon(item.path);
  Promise.resolve(src).then((uri) => {
    if (uri) {
      thumb.textContent = "";
      const img = document.createElement("img");
      img.src = uri;
      img.alt = "";
      thumb.appendChild(img);
    }
  });
  return thumb;
}

function moveBtn(label, enabled, onClick, kind) {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = "pin-btn" + (kind === "del" ? " del" : "");
  b.disabled = !enabled;
  if (enabled) b.addEventListener("click", onClick);
  return b;
}

async function move(from, to) {
  const [m] = cfg.pinned.splice(from, 1);
  cfg.pinned.splice(to, 0, m);
  await save();
  renderPins();
}

async function removePin(i) {
  cfg.pinned.splice(i, 1);
  await save();
  renderPins();
}

async function onAddApp() {
  const path = await pickAppFile();
  if (!path) return;
  const file = String(path).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "App";
  const name = file.replace(/\.(exe|lnk|bat|cmd)$/i, "");
  cfg.pinned.push({ id: uid(), name, path, args: [], kind: "app" });
  await save();
  renderPins();
}

async function onAddSeparator() {
  cfg.pinned.push({ id: uid(), name: "", path: "", args: [], kind: "separator" });
  await save();
  renderPins();
}

boot();
