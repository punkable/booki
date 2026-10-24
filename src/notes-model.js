/* Several notes in one Notes widget. A widget from before keeps its single
   note as the first one, under the widget's own id, so its encrypted
   recovery draft still matches. */
export const MAX_NOTES = 50;

export function notesOf(style = {}) {
  const list = Array.isArray(style.notes) ? style.notes.filter((note) => note && typeof note.id === "string") : [];
  if (list.length) return list.slice(0, MAX_NOTES).map((note) => ({ id: note.id, text: String(note.text || ""), at: Number(note.at) || 0 }));
  return [{ id: "main", text: String(style.note || ""), at: 0 }];
}

/** The note shown when the widget opens: the chosen one, else the newest. */
export function activeNote(style = {}) {
  const list = notesOf(style);
  return list.find((note) => note.id === style.activeNote) || [...list].sort((a, b) => b.at - a.at)[0] || list[0];
}

/** First line, trimmed, for lists and the dock tile. */
export const noteTitle = (text) => String(text || "").split("\n").map((line) => line.trim()).find(Boolean) || "";

/** Draft-journal key: the legacy note keeps the widget id. */
export const draftKey = (widgetId, noteId) => (noteId === "main" ? widgetId : `${widgetId}:${noteId}`);

/** Style with one note's text replaced; `note` mirrors the first note. */
export function withNoteText(style = {}, noteId, text, at = Date.now()) {
  const notes = notesOf(style).map((note) => (note.id === noteId ? { ...note, text, at } : note));
  return { ...style, notes, note: notes[0]?.text || "", activeNote: noteId };
}

export function withNewNote(style = {}, id) {
  const notes = [...notesOf(style), { id, text: "", at: Date.now() }].slice(-MAX_NOTES);
  return { ...style, notes, note: notes[0]?.text || "", activeNote: id };
}

export function withoutNote(style = {}, noteId) {
  let notes = notesOf(style).filter((note) => note.id !== noteId);
  if (!notes.length) notes = [{ id: "main", text: "", at: 0 }];
  const next = [...notes].sort((a, b) => b.at - a.at)[0];
  return { ...style, notes, note: notes[0].text, activeNote: next.id };
}
