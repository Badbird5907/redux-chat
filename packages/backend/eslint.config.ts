import { defineConfig } from "eslint/config";
import { baseConfig, restrictEnvAccess } from "@redux/eslint-config/base";

export default defineConfig(
  ...baseConfig,
  ...restrictEnvAccess,
  {
    files: ["convex/**/*.ts"],
    ignores: ["convex/functions/index.ts"], // Allow import in the custom functions file itself
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


