/* Which of the apps Windows counts as most used belong on a first dock. Pure,
 * so tests/first-dock.test.mjs can check it without a browser. */

// Installers, updaters and Booki itself are used often but never belong on a dock.
const NOT_A_DOCK_APP = /(unins\d*|setup|install|update|booki)[^\\/]*\.(exe|lnk)$/i;

/** The first `limit` distinct, dock-worthy apps, in the order given. */
export function firstDockApps(used, limit = 6) {
  const seen = new Set();
  const out = [];
  for (const app of used || []) {
    const key = String(app?.path || "").toLowerCase();
    if (!key || seen.has(key) || NOT_A_DOCK_APP.test(key)) continue;
    seen.add(key);
    out.push(app);
    if (out.length === limit) break;
  }
  return out;
}
