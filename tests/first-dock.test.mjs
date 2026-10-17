/* The first dock is built from the apps Windows counts as most used. */
import test from "node:test";
import assert from "node:assert/strict";
import { firstDockApps } from "../src/dock/first-dock.js";

test("the first dock keeps the most used apps and drops installers and Booki", () => {
  const used = [
    { name: "Chrome", path: "C:\\Chrome\\chrome.exe" },
    { name: "Booki", path: "C:\\Program Files\\Booki\\booki.exe" },
    { name: "Discord Setup", path: "C:\\Downloads\\Discord Setup.exe" },
    { name: "Chrome again", path: "c:\\chrome\\CHROME.EXE" },
    { name: "Uninstall", path: "C:\\App\\unins000.exe" },
    { name: "Update", path: "C:\\Users\\me\\AppData\\Local\\Discord\\Update.exe" },
    { name: "Spotify", path: "C:\\Spotify\\Spotify.exe" },
    { name: "No path", path: "" },
  ];
  assert.deepEqual(firstDockApps(used).map((a) => a.name), ["Chrome", "Spotify"]);
});

test("the first dock stops at the limit", () => {
  const used = Array.from({ length: 10 }, (_, i) => ({ name: `App ${i}`, path: `C:\\app${i}.exe` }));
  assert.equal(firstDockApps(used).length, 6);
  assert.equal(firstDockApps(used, 3).length, 3);
  assert.deepEqual(firstDockApps(null), []);
});
