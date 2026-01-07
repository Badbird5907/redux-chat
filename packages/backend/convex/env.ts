import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function backendEnv() {
  // Skip validation if environment variables aren't available
  // This happens during Convex deployment/analysis
  const shouldSkipValidation =
    !!process.env.CI ||
    process.env.npm_lifecycle_event === "lint" ||
    (!process.env.SITE_URL && !process.env.AUTH_SECRET); // If SITE_URL and AUTH_SECRET is missing, we're likely in module analysis

  return createEnv({
    server: {
      AUTH_GITHUB_ID: z.string().min(1),
      AUTH_GITHUB_SECRET: z.string().min(1),
      AUTH_SECRET:
        process.env.NODE_ENV === "production"
          ? z.string().min(1)
          : z.string().min(1).optional(),
      NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
      INTERNAL_CONVEX_SECRET: z.string().min(1),
      SITE_URL: z.string().min(1),
      NEXT_PUBLIC_SITE_URL: z.url(),
      NEXT_PUBLIC_S3_AVATARS_URL: z.url(),
      NEXT_PUBLIC_CONVEX_SITE_URL: z.url(),
      OPENAI_API_KEY: z.string().min(1),
    },
    runtimeEnv: process.env,
    skipValidation: shouldSkipValidation,
  });
}
