/* The dictionaries, as a contract rather than a report.
 *
 * `npm run check:i18n` already fails CI on a gap, but it is a script someone
 * has to keep wired into the pipeline. These are the two rules that actually
 * matter to a user, asserted where the rest of the suite lives: every language
 * says everything, and a translated string still carries the placeholders the
 * code will substitute into it. A dropped {n} renders as "Delete after days".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DICT, resolveLang } from "../src/i18n.js";
import { EXTRA } from "../src/i18n-extra.js";

const all = { ...DICT, ...EXTRA };
const LANGS = ["es", "en", "pt", "fr", "de"];
const reference = Object.keys(all.en);

test("every language ships every key", () => {
  for (const lang of LANGS) {
    assert.ok(all[lang], `no dictionary for ${lang}`);
    const missing = reference.filter((k) => !(k in all[lang]));
    assert.deepEqual(missing, [], `${lang} is missing ${missing.length} key(s)`);
    // And nothing the other way: a key only one language knows about is a
    // typo, and t() would silently fall through to English for everyone else.
    const stray = Object.keys(all[lang]).filter((k) => !reference.includes(k));
    assert.deepEqual(stray, [], `${lang} defines ${stray.length} key(s) English does not`);
  }
});

test("placeholders survive translation", () => {
  const holes = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
  for (const lang of LANGS) {
    for (const key of reference) {
      assert.deepEqual(
        holes(all[lang][key]),
        holes(all.en[key]),
        `${lang} "${key}" does not carry the same placeholders as English`
      );
    }
  }
});

test("no translation was left as the English source", () => {
  // Catches the copy-paste that quietly ships English under another flag.
  // Short strings and proper nouns legitimately match across languages
  // ("Booki", "CPU", "Auto"), so only weigh sentences.
  for (const lang of ["pt", "fr", "de"]) {
    const untouched = reference.filter(
      (k) => all.en[k].length > 40 && all[lang][k] === all.en[k]
    );
    assert.deepEqual(untouched, [], `${lang} left ${untouched.length} sentence(s) in English`);
  }
});

test("a system locale resolves to the closest language we have", () => {
  assert.equal(resolveLang("pt"), "pt");
  assert.equal(resolveLang("de"), "de");
  // An explicit choice always wins; "system" and anything unknown fall back.
  assert.ok(LANGS.includes(resolveLang("system")));
  assert.ok(LANGS.includes(resolveLang("kl")));
  assert.ok(LANGS.includes(resolveLang(undefined)));
});
