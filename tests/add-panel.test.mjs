/* The add panel's matching and candidate rules: what shows up, in what order,
 * and what is recognised as already on the dock. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  norm,
  matchScore,
  baseTitle,
  pinnedKeys,
  runningCandidates,
  installedCandidates,
  rank,
} from "../src/dock/add-panel.js";

test("matching ignores case and accents and prefers prefixes", () => {
  assert.equal(norm("Música"), "musica");
  assert.equal(matchScore("Spotify", "spo"), 3);
  assert.equal(matchScore("Visual Studio Code", "stu"), 2);
  assert.equal(matchScore("Notepad", "pad"), 1);
  assert.equal(matchScore("Notepad", "xyz"), 0);
  assert.equal(matchScore("Anything", ""), 1);
});

test("ranking puts prefix matches first and drops non-matches", () => {
  const list = [{ name: "Steam" }, { name: "Visual Studio" }, { name: "Paint" }, { name: "Obsidian" }];
  assert.deepEqual(rank(list, "st").map((c) => c.name), ["Steam", "Visual Studio"]);
});

test("pinned items are recognised by path, name or file name", () => {
  const keys = pinnedKeys([
    { name: "Code", path: "C:/Apps/code.exe" },
    { kind: "group", children: [{ name: "Spotify", path: "C:/Start/Spotify.lnk" }] },
  ]);
  const running = runningCandidates(
    [
      { exe: "c:/apps/code.exe" },
      { exe: "c:/apps/code.exe" },
      { exe: "c:/other/spotify.exe" },
      { exe: "c:/windows/explorer.exe" },
      { exe: "" },
    ],
    keys,
  );
  // One entry per executable, the shell left out, pinned ones sorted last.
  assert.deepEqual(running.map((c) => [c.name, c.pinned]), [["Code", true], ["Spotify", true]].sort((a, b) => Number(a[1]) - Number(b[1])));
  assert.equal(baseTitle("C:\\Start\\Visual Studio Code.lnk"), "Visual Studio Code");
});

test("installed apps are flattened, deduplicated and sorted", () => {
  const list = installedCandidates(
    [
      { name: "Tools", items: [{ name: "Zed", path: "z.lnk" }, { name: "Atom", path: "a.lnk" }] },
      { name: "", items: [{ name: "atom", path: "a2.lnk" }, { name: "Mail", path: "m.lnk" }] },
    ],
    new Set(),
  );
  assert.deepEqual(list.map((c) => c.name), ["Atom", "Mail", "Zed"]);
});
