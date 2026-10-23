/* Short, non-blocking notices: on the notch while the dock is tucked away,
   beside the bar while it is out. Never hides the dock, never steals focus.
   While a focus block runs or Windows' Do not disturb is on, notices wait and
   are shown when it ends; only critical ones (a nearly flat battery) pass. */
import { invoke, onNoticeAction } from "../api.js";
import { t } from "../i18n.js";
import { createNoticeActions } from "./notice-actions.js";
import { showNoticeToast } from "./undo-toast.js";
import { isFocusing, dndActive, onFocusDndChange, pollDnd } from "./focus-dnd.js";

const HELD_MAX = 5;
const held = [];
let heldTimer = null;
const noticeActions = createNoticeActions();
onNoticeAction((payload) => noticeActions.dispatch(payload).catch(() => showNoticeToast(t("overhaul.failed"))));

async function show(title, detail, actions = []) {
  let onNotch = false;
  const registered = actions.length ? noticeActions.register(actions) : null;
  try { onNotch = await invoke("notch_notice", { title, detail, actionId: registered?.id || null, actionLabels: registered?.labels || [] }); } catch (_) { onNotch = false; }
  if (!onNotch) { if (registered) noticeActions.revoke(registered.id); showNoticeToast(title, detail, actions); }
}

export const quiet = () => isFocusing() || dndActive();

export async function notify(title, detail = "", { critical = false, actions = [] } = {}) {
  if (!critical) await pollDnd(0);
  if (!critical && quiet()) {
    if (!held.some((entry) => entry.title === title && entry.detail === detail)) held.push({ title, detail, actions });
    if (held.length > HELD_MAX) held.shift();
    watchHeld();
    return;
  }
  await show(title, detail, actions);
}

/** Notices held so far (for tests and the Focus card). */
export const heldNotices = () => held.slice();

function flushHeld() {
  if (quiet() || !held.length) return;
  clearTimeout(heldTimer); heldTimer = null;
  held.splice(0).forEach(({ title, detail, actions }, i) => setTimeout(() => { void notify(title, detail, { actions }).catch(() => {}); }, i * 4000));
}
// A held notice must resume even with no Focus widget or a hidden dock.
// Keep a timer only while there is work to deliver.
function watchHeld() {
  if (heldTimer || !held.length) return;
  heldTimer = setTimeout(async () => {
    heldTimer = null;
    await pollDnd(0);
    flushHeld();
    watchHeld();
  }, 10000);
}
onFocusDndChange(flushHeld);
