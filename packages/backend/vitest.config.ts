import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 10_000,
  },
});
