/* Claude Code / Codex finishing or asking for approval while the dock is out:
   the notch is hidden then, so the dock shows the short notice itself. While
   the dock is tucked away the notch owns these (notch.js). One notice per
   change: the backend only emits on a state change, and repeats are dropped. */
import { onAgentActivity } from "../api.js";
import { t } from "../i18n.js";
import { notify } from "./notices.js";

export const AGENT_NAMES = {
  claude: "Claude", codex: "Codex", cursor: "Cursor", opencode: "OpenCode",
  gemini: "Gemini", windsurf: "Windsurf", goose: "Goose", cline: "Cline", continue: "Continue", "claude-app": "Claude",
};

const last = new Map();
onAgentActivity((activity) => {
  const { provider, state } = activity;
  const before = last.get(provider);
  last.set(provider, state);
  if (before === state || !["done", "waiting", "error"].includes(state)) return;
  if (document.visibilityState !== "visible") return;
  const key = state === "done" ? "notch.agentDone" : state === "error" ? "notch.agentError" : "notch.agentPaused";
  notify(t(key).replace("{agent}", () => AGENT_NAMES[provider] || provider)).catch(() => {});
});
