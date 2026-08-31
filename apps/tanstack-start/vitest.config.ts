import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/server/**/*.test.ts",
      "src/components/settings/models/**/*.test.ts",
    ],
    clearMocks: true,
    restoreMocks: true,
    env: {
      BYOK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      NODE_ENV: "test",
    },
  },
});
