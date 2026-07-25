/* Settings search: the option index and the matcher.

   Pure apart from t(), so it can be unit-tested in Node without React or a
   browser — see tests/settings-search.test.mjs. Extracted from settings.jsx,
   which had grown to 3600 lines with this buried in the middle. */
import { t } from "../i18n.js";

// Searchable option index: i18n key → tab that hosts it (settings search).
const SEARCH_INDEX = [
  ["ap.theme", "appearance"], ["ap.accent", "appearance"],
  ["ap.surface", "appearance"], ["ap.translucency", "appearance"],
  ["ap.solidity", "appearance"], ["ap.surfaceTint", "appearance"],
  ["ap.iconSize", "appearance"], ["ap.spacing", "appearance"], ["ap.radius", "appearance"],
  ["ap.compact", "appearance"],
  ["ap.language", "general"], ["ap.backup", "general"],
  ["be.position", "behavior"], ["be.autoHide", "behavior"], ["be.hideDelay", "behavior"], ["be.hideInFullscreen", "behavior"], ["be.edgeGap", "behavior"],
  ["be.taskbarFollow", "behavior"], ["be.taskbarSettle", "behavior"], ["be.taskbarHoldHover", "behavior"],
  ["be.notchMode", "behavior"], ["ap.notchSize", "behavior"],
  ["be.reveal", "behavior"], ["be.notchAlwaysVisible", "behavior"], ["prof.title", "behavior"],
  ["apps.newFolder", "apps"], ["group.ungroup", "apps"], ["group.takeOut", "apps"],
  ["be.magnify", "behavior"],
  ["be.zoom", "behavior"], ["be.anim", "behavior"], ["be.monitor", "behavior"],
  ["be.showLabels", "behavior"], ["be.showIndicators", "behavior"],
  ["be.autostart", "general"],
  ["apps.title", "apps"], ["apps.widgets", "apps"], ["apps.web", "apps"],
  ["w.mediaScrollVolume", "apps"],
  ["clip.memory", "apps"], ["clip.retention", "apps"], ["clip.limit", "apps"],
  ["clip.sensitive", "apps"], ["clip.compact", "apps"],
  ["gen.captureVisible", "general"],
  ["apps.addTrash", "apps"], ["apps.suggest", "apps"], ["trash.name", "apps"],
  ["sc.title", "general"], ["sc.global", "general"], ["sc.positions", "general"],
  ["faq.title", "faq"], ["faq.q.data", "faq"], ["faq.q.updates", "faq"],
  ["faq.q.smartscreen", "faq"], ["faq.q.uninstall", "faq"], ["faq.transparency", "faq"],
  ["ab.updates", "general"], ["ab.whatsNew", "general"],
];

const SEARCH_ALIASES = {
  "ap.theme": "tema theme claro oscuro light dark modo mode",
  "ap.accent": "color colour acento accent fondo wallpaper",
  "ap.surface": "mica acrylic acrilico tintado tinted solido solid material cristal glass windhawk taskbar barra",
  "ap.solidity": "solidez opacity opacidad translucidez translucency cristal",
  "ap.surfaceTint": "color cristal tint tinta fondo glass tint surface",
  "ap.translucency": "transparencia translucidez opacity material strength",
  "be.autoHide": "ocultar esconder auto hide hidden smart inteligente",
  "be.hideInFullscreen": "pantalla completa fullscreen juego pelicula movie presentation ocultar",
  "be.taskbarFollow": "taskbar barra tareas autohide ocultar windhawk seguir follow",
  "be.taskbarSettle": "retraso delay settle bajar notch taskbar barra",
  "be.taskbarHoldHover": "mantener hold hover cursor notch dock taskbar",
  "be.notchMode": "notch estilo pegado flotante inteligente iphone attached floating smart punto dot",
  "be.position": "posicion position borde edge arriba abajo izquierda derecha",
  "be.magnify": "zoom ampliar enlargement magnify",
  "ap.notchSize": "notch pastilla tamano size pill",
  "be.notchPeek": "notch peek asomar pegado attached",
  "be.reveal": "revelar reveal hover click notch",
  "apps.title": "aplicaciones programas pinned apps ancladas grupo group carpeta folder",
  "apps.newFolder": "grupo group carpeta folder merge fusionar",
  "apps.widgets": "widget reloj cpu ram bateria media musica",
  "clip.memory": "portapapeles clipboard privacidad privacy historial history",
  "sc.title": "atajo shortcut hotkey teclado keyboard",
  "prof.title": "perfil profile configuracion setup",
  "ap.backup": "respaldo backup exportar importar export import",
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
      const tabLabel = t(`tab.${tab}`);
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
