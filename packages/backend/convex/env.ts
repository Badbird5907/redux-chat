import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const authSecretSchema = z
  .string()
  .min(32, "AUTH_SECRET must be at least 32 characters")
  .refine(
    (value) => !["supersecret", "changeme", "change-me"].includes(value),
    "AUTH_SECRET must not use a placeholder value",
  );

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
      AUTH_GOOGLE_ID: z.string().min(1),
      AUTH_GOOGLE_SECRET: z.string().min(1),
      AUTH_SECRET:
        process.env.NODE_ENV === "production"
          ? authSecretSchema
          : authSecretSchema.optional(),
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      INTERNAL_CONVEX_SECRET: z.string().min(1),
      STRIPE_SECRET_KEY: z.string().min(1).optional(),
      STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
      STRIPE_PLUS_PRICE_ID: z.string().min(1).optional(),
      STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
      STRIPE_CREDIT_TOP_UP_PRODUCT_ID: z.string().min(1).optional(),
      SILO_CDN: z.string().min(1),
      SILO_TOKEN: z.string().min(1),
      SILO_URL: z.string().min(1),
      SITE_URL: z.string().min(1),
      VITE_CONVEX_SITE_URL: z.url(),
      OPENAI_API_KEY: z.string().min(1),
      OPENROUTER_API_KEY: z.string().min(1),
      GOOGLE_VERTEX_API_KEY: z.string().min(1),
      AA_API_KEY: z.string().min(1),
    },
    runtimeEnv: {
      AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
      AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
      AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
      AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
      AUTH_SECRET: process.env.AUTH_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      INTERNAL_CONVEX_SECRET: process.env.INTERNAL_CONVEX_SECRET,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PLUS_PRICE_ID: process.env.STRIPE_PLUS_PRICE_ID,
      STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID,
      STRIPE_CREDIT_TOP_UP_PRODUCT_ID:
        process.env.STRIPE_CREDIT_TOP_UP_PRODUCT_ID,
      SILO_CDN: process.env.SILO_CDN ?? process.env.VITE_SILO_CDN,
      SILO_TOKEN: process.env.SILO_TOKEN,
      SILO_URL: process.env.SILO_URL,
      SITE_URL: process.env.SITE_URL,
      VITE_CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GOOGLE_VERTEX_API_KEY: process.env.GOOGLE_VERTEX_API_KEY,
      AA_API_KEY: process.env.AA_API_KEY,
    },
    skipValidation: shouldSkipValidation,
  });
}
