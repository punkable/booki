/* The test harness's own file server stays inside dist/.
 *
 * Testing test infrastructure is usually not worth it, but this one guard is:
 * it had been written as `p.startsWith(DIST)`, a prefix test on a string
 * rather than on a path, so `../../etc/passwd` was rejected while a sibling
 * directory named `dist-anything` was served — its path really does start with
 * those letters. Nothing was reachable by an attacker (localhost only, during
 * `npm test`, serving a build directory), but the shape of the mistake is the
 * kind that gets copied into somewhere it does matter.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, DIST } from "./harness.mjs";

const SIBLING = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist-escape-probe");

test("the dev server refuses to serve anything outside dist/", async (t) => {
  // A sibling whose name shares dist's prefix — the case the old guard missed.
  mkdirSync(SIBLING, { recursive: true });
  writeFileSync(join(SIBLING, "secret.txt"), "SENTINEL");
  t.after(() => rmSync(SIBLING, { recursive: true, force: true }));

  const { srv, port } = await serveDist();
  t.after(() => srv.close());
  const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);

  assert.equal((await get("/index.html")).status, 200, "normal files still serve");

  for (const attack of [
    "/../dist-escape-probe/secret.txt",
    "/..%2fdist-escape-probe%2fsecret.txt", // encoded separator
    "/%2e%2e/dist-escape-probe/secret.txt", // encoded dots
    "/assets/../../dist-escape-probe/secret.txt",
    "/../../etc/passwd",
  ]) {
    const res = await get(attack);
    const body = res.status === 200 ? await res.text() : "";
    assert.equal(res.status, 404, `${attack} should be refused`);
    assert.ok(!body.includes("SENTINEL"), `${attack} leaked a file outside dist/`);
  }
});

test("DIST is absolute, so containment can be reasoned about at all", () => {
  assert.equal(DIST, resolve(DIST));
});
