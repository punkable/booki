/* First-run tips and the changelog after an update. */

import { dock as dockApi } from "../api.js";
import { emo } from "../emoji.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { S } from "./state.js";
import { reframe } from "./frame.js";
import { setHidden, scheduleHide } from "./autohide.js";
import { dismissPop, placePop } from "./popovers.js";
import { persist } from "./config-sync.js";
import { uid, widgetLabel } from "./helpers.js";
import { render } from "./render.js";
import { firstDockApps } from "./first-dock.js";

/** A first dock that already looks like yours: the apps you use most, a
 *  clock and the trash, instead of an empty bar asking to be filled. Only on
 *  a true first run, and only from Windows' own usage count when usage
 *  suggestions are allowed. Returns whether anything was added. */
async function seedFirstDock() {
  if (S.cfg.pinned.some((p) => p.kind !== "separator")) return false;
  if (S.cfg.usageRecommendationsEnabled === false) return false;
  let used = [];
  try { used = (await dockApi.frequentApps(24)) || []; } catch (_) { return false; }
  const apps = firstDockApps(used).map((app) => ({ id: uid(), name: app.name, path: app.path, args: [], kind: "app" }));
  if (!apps.length) return false;
  S.cfg.pinned = [
    ...apps,
    { id: uid(), name: "", path: "", args: [], kind: "separator" },
    { id: uid(), name: widgetLabel("clock"), path: "", args: [], kind: "widget", widget: "clock" },
    { id: uid(), name: t("trash.name"), path: "", args: [], kind: "trash" },
  ];
  if (!(await persist())) return false;
  await render();
  reframe();
  return true;
}

// Show the changelog the first time the app opens after an update.
export async function checkChangelog() {
  try {
    // Don't open Settings "What's new" during first-run tips.
    if (!S.cfg.onboarded) return;
    const v = await dockApi.appVersion();
    if (v && S.cfg.seenVersion !== v) {
      // Patch releases are fixes: record them without opening Settings.
      const feature = (version) => String(version || "").split(".").slice(0, 2).join(".");
      const announce = feature(S.cfg.seenVersion) !== feature(v);
      S.cfg.seenVersion = v;
      if (!(await persist())) return;
      if (announce) dockApi.openChangelog();
    }
  } catch (_) {}
}

// First-run tips: three small coach bubbles, shown once ever.
export async function maybeOnboard() {
  if (S.cfg.onboarded) return;
  await seedFirstDock();
  const steps = [
    { emoji: emo("pointer", 22), text: t("ob.step1") },
    { emoji: emo("card", 22), text: t("ob.step2") },
    { emoji: emo("beaver", 22), text: t("ob.step3") },
  ];
  let i = 0;
  S.pinnedReveal = true; // keep the dock open during the tour
  setHidden(false); // the tips are useless if the dock booted tucked away
  const pop = document.createElement("div");
  pop.className = "coach";
  pop.setAttribute("role", "dialog");
  placePop(pop);
  let btn = null;
  // Escape ends the tour the same way the last button does.
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape" && btn) { i = steps.length - 1; btn.click(); } });
  const showStep = () => {
    const last = i === steps.length - 1;
    // WinUI TeachingTip: content, then a footer with progress and the action,
    // a close button in the corner and a tail pointing at the bar.
    pop.innerHTML =
      `<span class="coach-emoji">${steps[i].emoji}</span>` +
      `<span class="coach-text">${steps[i].text}</span>` +
      `<span class="coach-foot"><span class="coach-dots" aria-hidden="true">${steps.map((_, k) => `<i${k === i ? ' class="on"' : ""}></i>`).join("")}</span></span>`;
    pop.setAttribute("aria-label", `${i + 1} / ${steps.length}`);
    const close = document.createElement("button");
    close.className = "coach-close";
    close.setAttribute("aria-label", t("ob.done"));
    close.innerHTML = icon("x");
    close.addEventListener("click", () => { i = steps.length - 1; btn.click(); });
    pop.appendChild(close);
    btn = document.createElement("button");
    btn.className = "coach-btn";
    btn.textContent = last ? t("ob.done") : t("ob.next");
    btn.addEventListener("click", async (e) => {
      if (last) e.currentTarget.disabled = true; // a second click must not finish twice
      i += 1;
      if (i < steps.length) {
        showStep();
      } else {
        dismissPop(pop, () => {
          document.body.classList.remove("pop-open");
          reframe();
        });
        S.cfg.onboarded = true;
        S.cfg.settingsIntroSeen = true;
        await persist();
        S.pinnedReveal = false;
        scheduleHide();
        checkChangelog();
      }
    });
    pop.querySelector(".coach-foot").appendChild(btn);
    btn.focus();
  };
  showStep();
}
