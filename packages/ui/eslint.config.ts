import { defineConfig } from "eslint/config";

import { baseConfig } from "@redux/eslint-config/base";
import { reactConfig } from "@redux/eslint-config/react";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  reactConfig,
);
