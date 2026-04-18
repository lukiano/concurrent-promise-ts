import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores(["**/*.js", "**/*.cjs", "**/*.mjs"]),
  tseslint.configs.recommended,
  {
    files: ["lib/**/*.ts", "test/**/*.ts"],
    plugins: { js },
    rules: {
      "no-unused-vars": "off",
    },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node }
  },
);
