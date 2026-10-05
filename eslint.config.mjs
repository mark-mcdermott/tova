/*
Flat config, because ESLint 9 reads nothing else.

The `.eslintrc.json` this replaces had been inert for some time: ESLint 9
dropped eslintrc, there was no `lint` script to run it from and no CI step to
call one, so nothing ever reported that the tool was exiting before it started.
The four layers below are the ones that file asked for.

`.mjs` rather than `.js` because the package is `"type": "commonjs"` and this is
written as a module.
*/

import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"

/*
 * react-hooks v7 is the React Compiler's lint suite, and `recommended` now
 * carries fourteen rules beyond the two it used to mean. Most of what they
 * find here is one deliberate pattern: `useCodeMirror` builds its view once and
 * keeps every handler reachable through a ref, which the compiler reads as an
 * impure write during render. It is the documented way to hold a non-React
 * library, and the file says so where it does it.
 *
 * Warn rather than error, and listed rather than blanket-disabled: each of
 * these deserves its own look at the editor, which is not a thing to do inside
 * the commit that merely gets the linter running again. Silent is the state
 * this whole change exists to end — so they stay visible and stay off the
 * failing path. `docs/ROADMAP.md` carries the follow-up.
 */
const COMPILER_RULES = {
  "react-hooks/refs": "warn",
  "react-hooks/purity": "warn",
  "react-hooks/set-state-in-effect": "warn"
}

export default tseslint.config(
  // Flat config has no `.eslintignore`. Build output, the Rust tree and the
  // seed vault's deliberately malformed fixtures are nobody's to lint — the
  // same list `.prettierignore` keeps, and for the same reason.
  {
    ignores: [
      "out/",
      "release/",
      "src-tauri/target/",
      "src-tauri/gen/",
      // Capacitor writes this and keeps writing it; see .prettierignore.
      "ios/",
      "scripts/seed/vault/",
      "conformance/",
      // Astro writes these itself on every build and they are not ours to
      // hold to our rules — same argument as drizzle/ in .prettierignore.
      ".astro/",
      ".vercel/",
      "out/"
    ]
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  react.configs.flat.recommended,
  reactHooks.configs.flat["recommended-latest"],

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...COMPILER_RULES,

      // The runtime has the automatic JSX transform; nothing imports React to
      // use JSX, and tsconfig's "jsx": "react-jsx" is what says so.
      "react/react-in-jsx-scope": "off",

      /*
       * A leading underscore is how this codebase already says "named so the
       * shape is right, not so the value is used" — the omitted key in a rest
       * destructure, the parameter a mock needs typed but never reads.
       */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  },

  /*
   * Control characters in a regex are the subject here, not a slip. Both files
   * exist to pin down what the tag scanner does when a NUL or a stray escape
   * turns up in a note, which cannot be expressed without writing one.
   */
  {
    files: ["scripts/build-tag-conformance.mjs", "src/renderer/*.conformance.test.ts"],
    rules: { "no-control-regex": "off" }
  },

  // `window.tova` is declared in tova.d.ts and built by src-tauri/bridge.js,
  // which the renderer never imports — so the global is real but invisible here.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { tova: "readonly" } }
  }
)
