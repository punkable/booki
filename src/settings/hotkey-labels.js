/* Shortcut key names as Windows shows them in each language. Display only:
   the stored shortcut keeps the English names the backend parses
   ("Ctrl+Shift+Space"). Keys without an entry are shown as stored. */

/** @type {Record<string, Record<string, string>>} */
const KEY_NAMES = {
  en: { Super: "Win", Escape: "Esc" },
  es: { Super: "Win", Shift: "Mayús", Space: "Espacio", Enter: "Entrar", Backspace: "Retroceso", Delete: "Supr", Insert: "Insert", Home: "Inicio", End: "Fin", PageUp: "RePág", PageDown: "AvPág", Escape: "Esc" },
  pt: { Super: "Win", Space: "Espaço", Escape: "Esc" },
  fr: { Super: "Win", Shift: "Maj", Space: "Espace", Enter: "Entrée", Backspace: "Retour arrière", Delete: "Suppr", Insert: "Inser", Home: "Origine", End: "Fin", PageUp: "Pg préc", PageDown: "Pg suiv", Escape: "Échap" },
  de: { Super: "Win", Ctrl: "Strg", Shift: "Umschalt", Space: "Leertaste", Enter: "Eingabe", Backspace: "Rücktaste", Delete: "Entf", Insert: "Einfg", Home: "Pos1", End: "Ende", PageUp: "Bild auf", PageDown: "Bild ab", Escape: "Esc" },
};

/** One key's name in `lang`.
 * @param {string} key @param {string} lang */
export function keyLabel(key, lang) {
  return (KEY_NAMES[lang] || KEY_NAMES.en)[key] || KEY_NAMES.en[key] || key;
}

/** A stored shortcut such as "Ctrl+Alt+Space" in `lang`.
 * @param {string|null|undefined} value @param {string} lang */
export function formatHotkey(value, lang) {
  if (!value) return "";
  return value.split("+").map((key) => keyLabel(key, lang)).join("+");
}
