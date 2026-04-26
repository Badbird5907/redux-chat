import { defineConfig } from "eslint/config";
import { baseConfig, restrictEnvAccess } from "@redux/eslint-config/base";

export default defineConfig(
  {
    ignores: [
      "convex/_generated/**",
      "convex/betterAuth/_generated/**",
    ],
  },
  ...baseConfig,
  ...restrictEnvAccess,
  {
    files: ["convex/**/*.ts"],
    ignores: ["convex/functions/index.ts", "convex/functions/internal.ts"], // Allow imports in the custom function wrappers
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/_generated/server"],
              message:
                "Do not import query/mutation directly from '_generated/server'. Use 'import { query, mutation } from \"./functions\"' or '@redux/backend/convex/functions' instead to ensure custom context and triggers are applied.",
            },
          ],
        },
      ],
    },
  },
);
