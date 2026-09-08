import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "dist/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      // CLI is run via tsx; excluded from app/node tsconfigs to avoid DOM/Node type clash.
      "src/cli/**",
      // Vitest owns these; not in the tsc project graph used by the ESLint project service.
      "tests/**",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Dense numerical kernels index fixed-size buffers; assertions and template metrics are intentional.
    files: [
      "src/fe/**/*.ts",
      "src/mesh/**/*.ts",
      "src/fixtures/**/*.ts",
      "src/ir/**/*.ts",
      "src/viz/**/*.ts",
      "src/research/**/*.ts",
      "src/ui/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "no-useless-assignment": "off",
    },
  },
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
