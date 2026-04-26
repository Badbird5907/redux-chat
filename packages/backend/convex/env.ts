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
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      INTERNAL_CONVEX_SECRET: z.string().min(1),
      SILO_CDN: z.string().min(1),
      SILO_TOKEN: z.string().min(1),
      SILO_URL: z.string().min(1),
      SITE_URL: z.string().min(1),
      VITE_SITE_URL: z.url(),
      VITE_S3_AVATARS_URL: z.url(),
      VITE_CONVEX_SITE_URL: z.url(),
      OPENAI_API_KEY: z.string().min(1),
      OPENROUTER_API_KEY: z.string().min(1),
    },
    runtimeEnv: {
      AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
      AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
      AUTH_SECRET: process.env.AUTH_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      INTERNAL_CONVEX_SECRET: process.env.INTERNAL_CONVEX_SECRET,
      SILO_CDN: process.env.SILO_CDN ?? process.env.VITE_SILO_CDN,
      SILO_TOKEN: process.env.SILO_TOKEN,
      SILO_URL: process.env.SILO_URL,
      SITE_URL: process.env.SITE_URL,
      VITE_SITE_URL: process.env.VITE_SITE_URL,
      VITE_S3_AVATARS_URL: process.env.VITE_S3_AVATARS_URL,
      VITE_CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    },
    skipValidation: shouldSkipValidation,
  });
}
