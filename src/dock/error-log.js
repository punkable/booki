/* Surface any runtime error to the app log (diagnostics on the user's machine).
   dock.js imports this first, so it is listening before the other dock
   modules evaluate. */
import { logMessage } from "../api.js";

window.addEventListener("error", (e) => logMessage("error", `dock: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `dock: unhandled ${e.reason}`)
);
