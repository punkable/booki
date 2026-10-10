/* Settings search: the option index and the matcher.

   Pure apart from t(), so it can be unit-tested in Node without React or a
   browser — see tests/settings-search.test.mjs. Extracted from settings.jsx,
   which had grown to 3600 lines with this buried in the middle. */
import { t } from "../i18n.js";

// Searchable option index: the i18n key a setting is labelled with → the page
// that hosts it. The label must match the row's data-setting-label so the
// result can scroll to it.
const SEARCH_INDEX = [
  ["dock.behavior", "dock"], ["be.reveal", "dock"], ["be.notchMode", "dock"], ["be.notchPresence", "dock"], ["be.hideDelay", "dock"], ["be.hideInFullscreen", "dock"],
  ["be.position", "dock"], ["be.monitor", "dock"], ["be.edgeGap", "dock"],
  ["tab.appearance", "dock"], ["ap.theme", "dock"], ["ap.accent", "dock"], ["dock.intensity", "dock"], ["ap.surfaceTint", "dock"], ["overhaul.reduceTransparency", "dock"],
  ["gp.size", "dock"], ["ap.iconSize", "dock"], ["ap.spacing", "dock"], ["ap.radius", "dock"], ["ap.compact", "dock"],
  ["gp.interaction", "dock"], ["be.magnify", "dock"], ["be.zoom", "dock"], ["be.anim", "dock"], ["overhaul.overflow", "dock"],
  ["be.showLabels", "dock"], ["be.showIndicators", "dock"], ["be.focusRunning", "dock"], ["be.alwaysOnTop", "dock"],
  ["be.taskbarFollow", "dock"], ["be.taskbarSettle", "dock"], ["be.taskbarHoldHover", "dock"], ["ap.nativeMaterial", "dock"],
  ["tab.widgets", "widgets"], ["overhaul.appsFolders", "apps"],
  ["ap.language", "system"], ["be.autostart", "system"], ["sc.toggle", "system"], ["sc.launcher", "system"], ["autoProf.title", "system"], ["sc.positions", "system"],
  ["ab.updates", "system"], ["tab.profiles", "system"], ["gen.captureVisible", "system"], ["gen.ctxMenu", "system"],
  ["overhaul.diagnostics", "system"], ["faq.title", "system"], ["ab.title", "system"], ["act.reset", "system"],
];

const PAGE_LABELS = { home: "overhaul.home", dock: "tab.dock", widgets: "tab.widgets", apps: "overhaul.appsFolders", system: "overhaul.system" };

const SEARCH_ALIASES = {
  "ap.theme": "tema theme claro oscuro light dark modo mode",
  "ap.accent": "color colour acento accent fondo wallpaper",
  "tab.appearance": "acabado finish surface fondo background mica acrylic acrilico tintado tinted solido solid material cristal vidrio glass",
  "dock.intensity": "intensidad solidez opacity opacidad translucidez translucency cristal vidrio glass",
  "ap.surfaceTint": "color cristal tint tinta fondo glass tint surface",
  "ap.translucency": "transparencia translucidez opacity material strength",
  "dock.behavior": "ocultar esconder auto hide hidden smart inteligente comportamiento behavior siempre visible",
  "be.hideInFullscreen": "pantalla completa fullscreen juego pelicula movie presentation ocultar",
  "be.taskbarFollow": "taskbar barra tareas autohide ocultar windhawk seguir follow",
  "be.taskbarSettle": "retraso delay settle bajar notch taskbar barra",
  "be.taskbarHoldHover": "mantener hold hover cursor notch dock taskbar",
  "be.notchMode": "notch forma shape pildora pill pestana tab punto dot circulo circle pegado flotante attached floating isla island smart inteligente",
  "be.notchPresence": "notch punto isla ocultar esconder maximizada navegador trabajar molesta auto hide dot",
  "be.position": "posicion position borde edge arriba abajo izquierda derecha",
  "be.magnify": "zoom ampliar enlargement magnify",
  "be.reveal": "revelar reveal sacar volver mostrar hover cursor click clic notch",
  "overhaul.appsFolders": "aplicaciones programas pinned apps ancladas grupo group carpeta folder web sitio papelera trash",
  "tab.widgets": "widget reloj clock cpu ram disco red sistema bateria media musica volumen nota portapapeles clipboard enfoque focus temporizador timer tareas tasks calendario clima weather",
  "sc.toggle": "atajo shortcut hotkey teclado keyboard",
  "tab.profiles": "perfil profile configuracion setup respaldo backup exportar importar export import",
};

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function fuzzySearchScore(text, term) {
  let cursor = 0;
  let gaps = 0;
  for (const char of term) {
    const next = text.indexOf(char, cursor);
    if (next < 0) return 0;
    gaps += next - cursor;
    cursor = next + 1;
  }
  return Math.max(1, 22 - gaps);
}

export function findSettings(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return SEARCH_INDEX
    .map(([key, tab]) => {
      const label = t(key);
      const tabLabel = t(PAGE_LABELS[tab]);
      const normalizedLabel = normalizeSearchText(label);
      const searchable = `${normalizedLabel} ${normalizeSearchText(tabLabel)} ${normalizeSearchText(SEARCH_ALIASES[key])}`;
      let score = normalizedLabel === normalizedQuery ? 200 : normalizedLabel.startsWith(normalizedQuery) ? 140 : 0;
      for (const term of terms) {
        const position = searchable.indexOf(term);
        const termScore = position >= 0 ? 70 - Math.min(position, 45) : fuzzySearchScore(searchable, term);
        if (!termScore) return null;
        score += termScore;
      }
      return { key, tab, label, tabLabel, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 8);
}
