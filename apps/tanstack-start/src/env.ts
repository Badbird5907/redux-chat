import { createEnv } from "@t3-oss/env-core";
import { vercel } from "@t3-oss/env-core/presets-zod";
import { z } from "zod";

function emptyToUndefined(value: unknown): unknown {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  return value;
}

export const SENTRY_DSN_FALLBACK =
  "https://9e4dc36f99ffee768f08dc2760568178@o4510709921873920.ingest.us.sentry.io/4511317701558272";

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
    EXA_API_KEY: z.string().min(1),
    E2B_API_KEY: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    GOOGLE_VERTEX_API_KEY: z.string().min(1),
    DOCUMENT_CONVERTER_URL: z.string().min(1),
    DOCUMENT_CONVERTER_BASIC_AUTH: z.string().min(1),
    DOCUMENT_CONVERTER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(40000),
    AA_API_KEY: z.string().min(1),
    SENTRY_AUTH_TOKEN: z.string().min(1),
  },
  client: {
    VITE_CONVEX_URL: z.string().min(1),
    VITE_CONVEX_SITE_URL: z.string().min(1),
    VITE_SENTRY_DSN: z.string().min(1).optional(),
  },
  runtimeEnv: {
    ...import.meta.env,
    ...process.env,
    SILO_CDN:
      process.env.SILO_CDN ??
      process.env.VITE_SILO_CDN ??
      import.meta.env.VITE_SILO_CDN,
  },
  skipValidation: true,
});

export function getSentryPublicDsn(): string {
  return env.VITE_SENTRY_DSN ?? SENTRY_DSN_FALLBACK;
}
