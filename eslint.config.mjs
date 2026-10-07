import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The engine is pure calculation: no UI, database or framework code.
  {
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message: "src/engine must not import UI code.",
            },
            {
              group: ["next", "next/*"],
              message: "src/engine must not import framework code.",
            },
            {
              group: ["@supabase/*"],
              message: "src/engine must not import database code.",
            },
            {
              group: ["@/app/*", "@/components/*", "@/lib/*", "@/hooks/*"],
              message: "src/engine must not import application code.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
