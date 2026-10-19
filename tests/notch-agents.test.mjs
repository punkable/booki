/* Claude Code / Codex on the notch: the backend emits booki://agent-activity
   on state changes; the notch shows the provider's logo and status while it
   works, the approval request above everything else, then a short "done". */
import test from "node:test";
import assert from "node:assert/strict";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig } from "./harness.mjs";

assertBuilt();
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => {
  await browser.close();
  srv.close();
});

const event = (page, name, payload) => page.evaluate(([name, payload]) => {
  for (const cb of window.__listeners[name] || []) cb({ payload });
}, [name, payload]);
const look = (page) => page.evaluate(() => ({
  classes: [...document.body.classList].filter((c) => c === "live" || c.startsWith("act-") || c.startsWith("agent-")),
  text: document.getElementById("nl-text").textContent,
  logo: !!document.querySelector("#nl-agent svg[fill='#D97757']"),
  logoShown: getComputedStyle(document.getElementById("nl-agent")).display !== "none",
  width: document.getElementById("notch-pill").getBoundingClientRect().width,
}));

test("Claude working, waiting for permission, then done", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", { cfg: makeConfig({ notchVisibility: "always", edge: "bottom", language: "en" }) });
  const since = Date.now() - 120000;
  await event(page, "booki://agent-activity", { provider: "claude", state: "working", since });
  let now = await look(page);
  assert.ok(now.classes.includes("live") && now.classes.includes("act-agent"), JSON.stringify(now));
  assert.ok(now.logo && now.logoShown, "Claude's coral logo is on the tab");
  assert.match(now.text, /Claude working/);
  assert.ok(now.width < 200, "compact, never a big banner");

  await event(page, "booki://agent-activity", { provider: "claude", state: "waiting", since: Date.now() });
  now = await look(page);
  assert.ok(now.classes.includes("act-agent-waiting"));
  assert.match(now.text, /needs your permission/);

  await event(page, "booki://agent-activity", { provider: "claude", state: "done", since: Date.now() });
  now = await look(page);
  assert.ok(now.classes.includes("act-agent-done"));
  assert.match(now.text, /Claude finished/);
  // A repeated "done" does not queue a second notice.
  await event(page, "booki://agent-activity", { provider: "claude", state: "done", since: Date.now() });
  await page.waitForTimeout(5300);
  now = await look(page);
  assert.ok(!now.classes.includes("act-agent-done") && !now.classes.includes("live"), JSON.stringify(now));
  assert.deepEqual(errors, []);
  await page.close();
});

test("the setting turns agents off", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", { cfg: makeConfig({ notchVisibility: "always", edge: "bottom", notchAgents: false }) });
  await event(page, "booki://agent-activity", { provider: "codex", state: "working", since: Date.now() });
  assert.ok(!(await look(page)).classes.includes("act-agent"));
  assert.deepEqual(errors, []);
  await page.close();
});
