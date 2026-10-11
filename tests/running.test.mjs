/* Which open windows count as a pin's windows.
 *
 * The title fallback used to be a plain substring test, so a folder pin named
 * "Docs" showed as open for any tab that said "docs" and a click focused it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { windowsFor, titleHasWord } from "../src/dock/running.js";

const wins = [
  { hwnd: 1, title: "Google Docs - Chrome", exe: "C:\\Program Files\\Google\\Chrome\\chrome.exe" },
  { hwnd: 2, title: "Notes - Notepad", exe: "C:\\Windows\\notepad.exe" },
  { hwnd: 3, title: "Spotify Premium", exe: "C:\\Users\\a\\AppData\\Spotify.exe" },
  { hwnd: 4, title: "Codex app", exe: "C:\\x\\other.exe" },
];

test("an .exe pin matches by executable, case-insensitively", () => {
  const pin = { kind: "app", name: "Notepad", path: "C:\\WINDOWS\\NOTEPAD.EXE" };
  assert.deepEqual(windowsFor(pin, wins).map((w) => w.hwnd), [2]);
});

test("a folder pin never matches by title", () => {
  const pin = { kind: "folder", name: "Docs", path: "C:\\Users\\a\\Docs" };
  assert.deepEqual(windowsFor(pin, wins), []);
  const long = { kind: "folder", name: "Spotify", path: "C:\\Users\\a\\Spotify" };
  assert.deepEqual(windowsFor(long, wins), []);
});

test("a shell pin falls back to a whole-word title match", () => {
  const pin = { kind: "app", name: "Spotify", path: "shell:AppsFolder\\Spotify" };
  assert.deepEqual(windowsFor(pin, wins).map((w) => w.hwnd), [3]);
  // "Code" is too short, and would also be a prefix of "Codex".
  assert.deepEqual(windowsFor({ kind: "app", name: "Code", path: "x.lnk" }, wins), []);
});

test("whole words only, and at least 4 characters", () => {
  assert.equal(titleHasWord("Codex app", "Code"), false);
  assert.equal(titleHasWord("Codex app", "Codex"), true);
  assert.equal(titleHasWord("My Codex", "Code"), false);
  assert.equal(titleHasWord("Mail - Inbox", "mail"), true);
  assert.equal(titleHasWord("Gmail - Inbox", "mail"), false);
  assert.equal(titleHasWord("Word", "Wor"), false);
  assert.equal(titleHasWord("Visual Studio (C++)", "Studio (C++)"), true);
});

test("a group collects its children's windows without duplicates", () => {
  const group = {
    kind: "group",
    children: [
      { kind: "app", name: "Notepad", path: "c:\\windows\\notepad.exe" },
      { kind: "app", name: "Notepad 2", path: "c:\\windows\\notepad.exe" },
      { kind: "folder", name: "Docs", path: "c:\\docs" },
    ],
  };
  assert.deepEqual(windowsFor(group, wins).map((w) => w.hwnd), [2]);
});

test("separators, trash and widgets have no windows", () => {
  for (const kind of ["separator", "trash", "widget"]) {
    assert.deepEqual(windowsFor({ kind, name: "Spotify" }, wins), []);
  }
});
