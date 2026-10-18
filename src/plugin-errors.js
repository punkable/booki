/* Plugin errors come from the native side in plain English. Known ones are
   shown in the user's language; anything else keeps its original text. */
import { t } from "./i18n.js";

const KNOWN = [
  [/operation is in progress|download is already running/i, "perr.busy"],
  [/install the plugin first/i, "perr.notInstalled"],
  [/checksum|pinned, verified download|unexpected download address|expected program/i, "perr.verify"],
  [/could not reach|download failed|download interrupted/i, "perr.network"],
  [/too large/i, "perr.tooLarge"],
  [/took too long/i, "perr.timeout"],
  [/^close .* first/i, "perr.closeFirst"],
  [/Remote Web Server/i, "perr.lhmServer"],
  [/App Installer/i, "perr.appInstaller"],
  [/HTTP or HTTPS link/i, "perr.link"],
  [/download folder/i, "perr.folder"],
  [/\.orp profile/i, "perr.profile"],
];

export function pluginError(error) {
  const raw = String(error?.message ?? error ?? "").replace(/^Error:\s*/, "");
  const hit = KNOWN.find(([pattern]) => pattern.test(raw));
  return hit ? t(hit[1]) : `${t("plugins.failed")} ${raw}`;
}
