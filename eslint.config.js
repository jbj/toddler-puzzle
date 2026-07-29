import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".art"] },

  // The game itself: browser globals, and type-aware rules, because the whole
  // point of the TypeScript here is that a piece cannot drift out of step with
  // its hole.
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Unused arguments are fine when they name a signature; unused variables
      // are not.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // The build configuration. Not part of the bundle and not type-checked
  // against the game's tsconfig, so it is linted without type information -
  // the same treatment the Node scripts get, for the same reason.
  {
    files: ["vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },

  // The review and check harnesses are plain Node scripts, not part of the
  // bundle, so they are linted without type information. A test written as
  // `.mjs` is here for the same reason: it exercises one of those scripts,
  // which the game's tsconfig does not cover.
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
);
