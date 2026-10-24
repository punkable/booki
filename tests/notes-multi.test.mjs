import test from "node:test";
import assert from "node:assert/strict";
import { notesOf, activeNote, draftKey, withNoteText, withNewNote, withoutNote } from "../src/notes-model.js";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";

test("a single note from before becomes the first note and keeps its recovery key", () => {
  const style = { note: "Buy milk" };
  assert.deepEqual(notesOf(style), [{ id: "main", text: "Buy milk", at: 0 }]);
  assert.equal(draftKey("w1", "main"), "w1");
  assert.equal(draftKey("w1", "n2"), "w1:n2");
  const added = withNewNote(withNoteText(style, "main", "Buy oat milk", 1), "n2");
  assert.equal(notesOf(added).length, 2);
  assert.equal(activeNote(added).id, "n2");
  assert.equal(added.note, "Buy oat milk", "the legacy field mirrors the first note");
  const left = withoutNote(added, "n2");
  assert.deepEqual(notesOf(left).map((note) => note.id), ["main"]);
  assert.equal(notesOf(withoutNote(left, "main")).length, 1, "deleting the last note leaves an empty one");
});

assertBuilt();
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });

test("notes can be added, switched and deleted from the dock", async () => {
  const pin = { id: "n", kind: "widget", widget: "notes", name: "", path: "", style: { note: "First note" } };
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [pin] }) });
  await page.locator('[data-id="n"]').click();
  const editor = page.locator(".note-editor.is-open");
  await editor.locator("textarea:not([disabled])").waitFor();
  assert.equal(await editor.locator(".note-strip").isHidden(), true, "one note shows no chips");
  await editor.getByRole("button", { name: "New note (Ctrl+N)" }).click();
  await editor.locator(".note-chip").nth(1).waitFor();
  await editor.locator("textarea:not([disabled])").fill("Second note");
  await editor.getByRole("tab", { name: "First note" }).click();
  await waitForAsyncCondition(page, () => document.querySelector(".note-editor textarea").value === "First note");
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config"));
  assert.deepEqual(saved.pinned[0].style.notes.map((note) => note.text), ["First note", "Second note"]);
  await editor.getByRole("tab", { name: "Second note" }).click();
  await waitForAsyncCondition(page, () => document.querySelector(".note-editor textarea").value === "Second note");
  await editor.getByRole("button", { name: "Delete this note" }).click();
  await editor.getByRole("button", { name: "Click again to delete the note" }).click();
  await waitForAsyncCondition(page, () => document.querySelector(".note-editor textarea").value === "First note");
  const after = await page.evaluate(() => window.__TAURI__.core.invoke("get_config"));
  assert.deepEqual(after.pinned[0].style.notes.map((note) => note.text), ["First note"]);
  assert.deepEqual(errors, []); await page.close();
});
