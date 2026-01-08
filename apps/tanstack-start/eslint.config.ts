import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@redux/eslint-config/base";
import { reactConfig } from "@redux/eslint-config/react";

export default defineConfig(
  {
    ignores: [".nitro/**", ".output/**", ".tanstack/**"],
  },
  baseConfig,
  reactConfig,
  restrictEnvAccess,
);