import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { vercel } from "@t3-oss/env-core/presets-zod";

const processEnv = !!process.env.INTERNAL_CONVEX_SECRET
export const env = createEnv({
  clientPrefix: "VITE_",
  extends: [vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  server: {
  },
  client: {
    VITE_CONVEX_URL: z.string().min(1),
    VITE_CONVEX_SITE_URL: z.string().min(1),
  },
  runtimeEnv: processEnv ? process.env : import.meta.env,
  skipValidation: true,
});