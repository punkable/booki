/* Plugin updates: each Booki release pins newer plugin versions. A while
   after start and then every few hours, compare Booki's own copies with the
   pinned ones and say so once per set of versions. Nothing downloads here:
   updating stays a deliberate click on the Plugins page, and a widget keeps
   its settings because it refers to the plugin by id, not by its files. */
import { dock as dockApi } from "../api.js";
import { t } from "../i18n.js";
import PLUGINS from "../plugin-catalog.json";
import { showNoticeToast } from "./undo-toast.js";

const FIRST_CHECK_MS = 90 * 1000;
const EVERY_MS = 6 * 3600 * 1000;
let told = "";

export async function checkPluginUpdates() {
  if (document.hidden) return;
  const outdated = [];
  for (const plugin of PLUGINS.filter((p) => !p.companion && !p.external)) {
    const status = await dockApi.pluginStatus(plugin.id).catch(() => null);
    if (status?.installed && status.outdated) outdated.push(`${plugin.name} ${status.latest}`);
  }
  const key = outdated.join("|");
  if (!outdated.length || key === told) return;
  told = key;
  showNoticeToast(t("plugins.updatesTitle"), t("plugins.updatesBody").replace("{list}", () => outdated.join(", ")),
    [{ label: t("plugins.review"), run: () => dockApi.openSettingsTab("plugins") }]);
}

export function startPluginUpdateChecks() {
  setTimeout(checkPluginUpdates, FIRST_CHECK_MS);
  setInterval(checkPluginUpdates, EVERY_MS);
}
