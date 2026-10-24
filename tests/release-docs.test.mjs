import test from "node:test";
import assert from "node:assert/strict";
import { validateCaptures } from "../scripts/release-docs.mjs";

test("publication rejects old versions, stale UI, Dev captures and missing/replaced images", () => {
  const files = Object.fromEntries(["en"].flatMap((lang) => ["hero", "island", "groups", "widgets", "settings", "dark"].map((name) => [`docs/presentation/${name}-${lang}.jpg`, "digest"])));
  const manifest = { version: "1.2.3", source: "current UI", edition: "official", files };
  const expected = { version: "1.2.3", source: "current UI", hash: () => "digest" };
  assert.doesNotThrow(() => validateCaptures(manifest, expected));
  assert.throws(() => validateCaptures({ ...manifest, version: "1.2.2" }, expected), /version/);
  assert.throws(() => validateCaptures({ ...manifest, source: "old UI" }, expected), /source/);
  assert.throws(() => validateCaptures({ ...manifest, edition: "dev" }, expected), /edition/);
  assert.throws(() => validateCaptures({ ...manifest, edition: "preview" }, expected), /edition/);
  assert.throws(() => validateCaptures({ ...manifest, files: {} }, expected), /Unverified screenshot/);
  assert.throws(() => validateCaptures(manifest, { ...expected, hash: () => "changed bytes" }), /Unverified screenshot/);
});
