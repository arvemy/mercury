import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    projects: ["apps/*", "cli*"],
  },
  fmt: {
    endOfLine: "lf",
    semi: false,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "es5",
    printWidth: 80,
    sortPackageJson: false,
    ignorePatterns: [
      "dist/",
      "node_modules/",
      ".turbo/",
      "coverage/",
      "pnpm-lock.yaml",
      ".pnpm-store/",
      "apps/api/drizzle/",
      ".agents/",
      ".claude/",
      "skills-lock.json",
      "apps/web/src/routeTree.gen.ts",
      "cli/template/",
      ".cloudflare/",
      ".audit/",
    ],
  },
  lint: {
    plugins: ["eslint", "typescript", "unicorn", "oxc", "react"],
    categories: {
      correctness: "error",
    },
    ignorePatterns: [
      "**/dist",
      ".agents/",
      ".claude/",
      "apps/web/src/routeTree.gen.ts",
      "**/.cloudflare/**",
      ".audit/",
    ],
    rules: {
      "no-array-constructor": "error",
      "no-case-declarations": "error",
      "no-empty": "error",
      "no-fallthrough": "error",
      "no-prototype-builtins": "error",
      "no-redeclare": "error",
      "no-regex-spaces": "error",
      "no-unexpected-multiline": "error",
      "no-useless-assignment": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "preserve-caught-error": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/no-empty-object-type": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-namespace": "error",
      "typescript/no-require-imports": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/no-unsafe-function-type": "error",
      "react/exhaustive-deps": "warn",
      "react/incompatible-library": "warn",
      "react/unsupported-syntax": "warn",
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "error",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["apps/web/src/routes/**/*.tsx"],
        rules: {
          "react/only-export-components": "off",
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
})
