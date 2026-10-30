import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.expo/**",
      "**/dist/**",
      "**/coverage/**",
      "**/android/**",
      "**/ios/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.cjs", "**/*.mjs", "**/app.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        console: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        structuredClone: "readonly",
        URL: "readonly"
      }
    }
  },
  {
    files: ["**/*.cjs", "**/app.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
];
