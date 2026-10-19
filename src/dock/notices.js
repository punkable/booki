/* Short, non-blocking notices: on the notch while the dock is tucked away,
   beside the bar while it is out. Never hides the dock, never steals focus.
   While a focus block runs or Windows' Do not disturb is on, notices wait and
   are shown when it ends; only critical ones (a nearly flat battery) pass. */
import { invoke } from "../api.js";
import { showNoticeToast } from "./undo-toast.js";
import { isFocusing, dndActive, onFocusDndChange } from "./focus-dnd.js";

const HELD_MAX = 5;
const held = [];

async function show(title, detail) {
  let onNotch = false;
  try { onNotch = await invoke("notch_notice", { title, detail }); } catch (_) { onNotch = false; }
  if (!onNotch) showNoticeToast(title, detail);
}

export const quiet = () => isFocusing() || dndActive();

export async function notify(title, detail = "", { critical = false } = {}) {
  if (!critical && quiet()) {
    if (!held.some((entry) => entry.title === title && entry.detail === detail)) held.push({ title, detail });
    if (held.length > HELD_MAX) held.shift();
    return;
  }
  await show(title, detail);
}

/** Notices held so far (for tests and the Focus card). */
export const heldNotices = () => held.slice();

onFocusDndChange(() => {
  if (quiet() || !held.length) return;
  held.splice(0).forEach(({ title, detail }, i) => setTimeout(() => show(title, detail), i * 4000));
});
