/* Quick launcher ranking: what an empty query suggests, and how a typed
   query orders open windows, pins and installed apps. */
import test from "node:test";
import assert from "node:assert/strict";
import { launcherResults } from "../src/dock/launcher.js";

const pinned = [
  { kind: "app", name: "Firefox", path: "C:/Apps/firefox.exe" },
  { kind: "group", name: "Work", children: [{ kind: "app", name: "Slack", path: "C:/Apps/slack.exe" }] },
  { kind: "folder", name: "Projects", path: "C:/Users/me/Projects" },
  { kind: "widget", widget: "clock" },
];
const installed = [{ items: [
  { name: "Firefox", path: "c:\\apps\\firefox.exe" },
  { name: "Figma", path: "C:/Apps/figma.exe" },
  { name: "Tools", path: "C:/Tools", is_dir: true },
] }];
const windows = [{ hwnd: 42, title: "Inbox - Firefox", exe: "C:/Apps/firefox.exe" }];

test("an empty query lists pins (inside groups too) and frequent apps, not windows", () => {
  const names = launcherResults({ pinned, installed, windows, frequent: [{ name: "Code", path: "C:/Apps/code.exe" }] }, "").map((r) => r.name);
  assert.deepEqual(new Set(names), new Set(["Firefox", "Slack", "Projects", "Code"]));
});

test("an app that is already open carries its window, so Enter can switch to it", () => {
  const results = launcherResults({ pinned, installed, windows }, "fir");
  assert.equal(results[0].name, "Firefox");
  assert.equal(results[0].hwnd, 42);
  assert.ok(results.some((r) => r.kind === "window" && r.name === "Inbox - Firefox"));
  assert.equal(launcherResults({ pinned, installed, windows }, "fig")[0].hwnd, undefined);
});

test("the same app listed twice (pin and installed) appears once", () => {
  const results = launcherResults({ pinned, installed, windows: [] }, "firefox");
  assert.equal(results.filter((r) => r.kind !== "window").length, 1);
});

test("installed apps are searchable but folders from the index are not", () => {
  const names = launcherResults({ pinned: [], installed, windows: [] }, "f").map((r) => r.name);
  assert.ok(names.includes("Figma"));
  assert.ok(!launcherResults({ pinned: [], installed, windows: [] }, "tools").length);
});

test("pinned folders are marked so the row says Folder", () => {
  const [hit] = launcherResults({ pinned }, "proj");
  assert.equal(hit.folder, true);
});

test("results are capped", () => {
  const many = [{ items: Array.from({ length: 30 }, (_, i) => ({ name: `App ${i}`, path: `C:/a${i}.exe` })) }];
  assert.equal(launcherResults({ installed: many }, "app").length, 8);
});
