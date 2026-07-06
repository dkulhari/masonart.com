import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.output/**",
      "**/.vinxi/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/routeTree.gen.ts",
      "packages/api/src/database/migrations/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // The web API client and several handlers use `any` generics; typecheck
      // (strict tsconfig) is the type-safety gate, lint stays fast and quiet.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["packages/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Test suites keep unused fixtures/imports around for documentation and
    // skipped cases; don't fail the build on them.
    files: ["**/tests/**/*.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-control-regex": "off",
    },
  },
  prettier
);
