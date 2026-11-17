import js from "@eslint/js";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "reports/**", "playwright-report/**", "test-results/**", "coverage/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Flags every typed `obj[key]`; TypeScript key types already constrain these. See SECURITY.md.
      "security/detect-object-injection": "off",
    },
  },
  {
    // Offline eval tooling reads repo files under evals/ and reports/. Paths come from constants
    // plus safeId()-checked suite names, never from HTTP input. Kept on for app/, src/, middleware.ts.
    files: ["evals/**", "scripts/**", "tests/**"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },
);
