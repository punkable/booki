/* Short, non-blocking notices: on the notch while the dock is tucked away,
   beside the bar while it is out. Never hides the dock, never steals focus. */
import { invoke } from "../api.js";
import { showNoticeToast } from "./undo-toast.js";

export async function notify(title, detail = "") {
  let onNotch = false;
  try { onNotch = await invoke("notch_notice", { title, detail }); } catch (_) { onNotch = false; }
  if (!onNotch) showNoticeToast(title, detail);
}
