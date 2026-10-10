/* Pins without an icon: a stable palette colour, a readable ink, and the
   right mark for apps, websites and folders. */
import test from "node:test";
import assert from "node:assert/strict";
import { pinFallback } from "../src/pin-fallback.js";
import { GROUP_PALETTE } from "../src/group-style.js";

const shades = (family) => GROUP_PALETTE.find(([name]) => name === family)[1];

test("the same name always gets the same colour", () => {
  const a = pinFallback({ kind: "app", name: "Notepad", path: "C:/notepad.exe" });
  const b = pinFallback({ kind: "app", name: "notepad", path: "D:/other.exe" });
  assert.equal(a.color, b.color);
  assert.equal(a.letter, "N");
  assert.equal(a.glyph, "");
});

test("websites show a globe and folders a folder", () => {
  assert.equal(pinFallback({ kind: "app", name: "Docs", path: "https://example.com" }).glyph, "globe");
  const folder = pinFallback({ kind: "folder", name: "Proyectos", path: "C:/Users/Proyectos" });
  assert.equal(folder.glyph, "folder");
  assert.equal(folder.letter, "");
});

test("yellow and graphite are never picked", () => {
  const banned = new Set([...shades("yellow"), ...shades("graphite")]);
  for (let i = 0; i < 200; i++) {
    const look = pinFallback({ kind: "app", name: `App ${i}`, path: "" });
    assert.ok(!banned.has(look.color), look.color);
    assert.ok(["#ffffff", "#241a10"].includes(look.ink));
  }
});

test("an empty name still renders something", () => {
  assert.equal(pinFallback({ kind: "app", name: "", path: "" }).letter, "?");
});
