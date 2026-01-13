import { createEnv } from "@t3-oss/env-core";
import { vercel } from "@t3-oss/env-core/presets-zod";
import { z } from "zod/v4";

import { backendEnv } from "@redux/backend/env";

const processEnv = !!process.env.INTERNAL_CONVEX_SECRET

export const env = createEnv({
  clientPrefix: "VITE_",
  // @ts-expect-error - ???
  extends: [vercel(), backendEnv()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    INTERNAL_CONVEX_SECRET: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    VITE_CONVEX_URL: z.url(),
    VITE_CONVEX_SITE_URL: z.url(),
    VITE_S3_AVATARS_URL: z.url(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    NODE_ENV: import.meta.env.NODE_ENV,
    VITE_S3_AVATARS_URL: import.meta.env.VITE_S3_AVATARS_URL,
    VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
    VITE_CONVEX_SITE_URL: import.meta.env.VITE_CONVEX_SITE_URL,
  },
  
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
