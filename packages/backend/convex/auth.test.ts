// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthOptions } from "./auth";

const REQUIRED_ENV = {
  AA_API_KEY: "aa-api-key",
  AUTH_GITHUB_ID: "github-id",
  AUTH_GITHUB_SECRET: "github-secret",
  AUTH_GOOGLE_ID: "google-id",
  AUTH_GOOGLE_SECRET: "google-secret",
  AUTH_SECRET: "a".repeat(32),
  GOOGLE_VERTEX_API_KEY: "google-vertex-api-key",
  INTERNAL_CONVEX_SECRET: "internal-convex-secret",
  OPENAI_API_KEY: "openai-api-key",
  OPENROUTER_API_KEY: "openrouter-api-key",
  SILO_CDN: "https://cdn.example.test",
  SILO_TOKEN: "silo-token",
  SILO_URL: "https://silo.example.test",
  SITE_URL: "http://localhost:3712",
} as const;

function withRequiredEnv<T>(callback: () => T) {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    vi.stubEnv(key, value);
  }

  return callback();
}

describe("createAuthOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps active user sessions for the longest practical browser lifetime", () => {
    const options = withRequiredEnv(() =>
      createAuthOptions({} as Parameters<typeof createAuthOptions>[0]),
    );

    expect(options.session).toMatchObject({
      expiresIn: 60 * 60 * 24 * 400,
      updateAge: 60 * 60 * 24,
    });
  });
});
