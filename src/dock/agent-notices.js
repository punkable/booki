/* Claude Code / Codex finishing or asking for approval while the dock is out:
   the notch is hidden then, so the dock shows the short notice itself. While
   the dock is tucked away the notch owns these (notch.js). One notice per
   change: the backend only emits on a state change, and repeats are dropped. */
import { onAgentActivity } from "../api.js";
import { t } from "../i18n.js";
import { showNoticeToast } from "./undo-toast.js";

export const AGENT_NAMES = { claude: "Claude", codex: "Codex" };

const last = new Map();
onAgentActivity((activity) => {
  const { provider, state } = activity;
  const before = last.get(provider);
  last.set(provider, state);
  if (before === state || (state !== "done" && state !== "waiting")) return;
  if (document.visibilityState !== "visible") return;
  const key = state === "done" ? "notch.agentDone" : "notch.agentWaiting";
  showNoticeToast(t(key).replace("{agent}", () => AGENT_NAMES[provider] || provider));
});
