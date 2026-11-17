import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Stylistic only; quotes in JSX text are fine.
      "react/no-unescaped-entities": "off",
      // Tech debt: ~95 `any` usages remain. Kept visible as warnings so lint can gate CI;
      // tighten back to "error" once they are typed (Phase 2).
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "functions/**",
  ]),
]);

export default eslintConfig;
