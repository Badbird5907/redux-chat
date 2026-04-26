import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { vercel } from "@t3-oss/env-core/presets-zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  extends: [vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  server: {
    INTERNAL_CONVEX_SECRET: z.string().min(1),
    SILO_CDN: z.string().min(1),
    SILO_URL: z.string().min(1),
    SILO_TOKEN: z.string().min(1),
  },
  client: {
    VITE_CONVEX_URL: z.string().min(1),
    VITE_CONVEX_SITE_URL: z.string().min(1),
  },
  runtimeEnv: {
    ...import.meta.env,
    ...process.env,
    SILO_CDN: process.env.SILO_CDN ?? process.env.VITE_SILO_CDN ?? import.meta.env.VITE_SILO_CDN,
  },
  skipValidation: true,
});
