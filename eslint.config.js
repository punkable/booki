/* Lint config for Booki.

   Deliberately narrow: this catches bugs, not style. There is no formatter and
   no opinion about quotes or semicolons here — the goal is that a rule firing
   always means something is actually wrong, so the signal stays trustworthy.

   Rules earn their place by having caught a real bug in this codebase:
     no-unused-vars      — `manualReveal` was assigned in six places and read in
                           none; a whole flag pretending to do something.
     no-undef            — a typo'd global silently becomes a runtime crash in
                           the dock, which has no error boundary.
     no-unsafe-optional-chaining, no-constant-condition, etc. come from
     eslint:recommended and cover the same class of mistake. */
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";

export default [
  { ignores: ["dist/**", "node_modules/**", "src-tauri/**", "assets/**"] },

  js.configs.recommended,

  {
    files: ["src/**/*.js", "src/**/*.jsx", "tools/presentation/src/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // JSX references must count as uses, and missing component imports must
    // fail before a Settings panel reaches the runtime error boundary.
    plugins: { react },
    rules: {
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react/jsx-no-undef": "error",
      // `catch (_) {}` is the established best-effort idiom here (pointer
      // capture, optional IPC). An empty block elsewhere is still an error.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Unused *arguments* are often meaningful documentation on a callback, so
      // only flag them when they trail the signature. `_`-prefixed names are the
      // established "intentionally ignored" convention in this codebase
      // (`catch (_)` appears throughout).
      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // The dock renders untrusted-ish strings (file names, clipboard text,
      // window titles) into innerHTML in places; `esc()` exists for that. This
      // does not detect misuse, but it does stop `eval`-shaped code appearing.
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },

  {
    // Node tooling: different globals, and console output is the point.
    files: ["scripts/**/*.mjs", "tools/presentation/*.mjs", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  {
    files: ["tools/presentation/capture.mjs", "scripts/benchmark-ui.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  {
    // Tests run in Node, but the bodies of `page.evaluate(...)` are serialized
    // and executed in the browser, so `document` and friends are genuinely in
    // scope there. Both global sets apply.
    files: ["tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
