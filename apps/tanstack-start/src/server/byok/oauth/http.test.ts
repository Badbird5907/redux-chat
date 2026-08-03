import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSameOrigin,
  isSameOriginOrMissing,
  oauthAuthFailureResponse,
  requireByokUser,
} from "./http";

const mocks = vi.hoisted(() => ({
  getRequestUserIdFromHeaders: vi.fn<() => Promise<string | undefined>>(),
  fetchAuthQuery: vi.fn<() => Promise<{ entitlements: { byok: boolean } }>>(),
}));

vi.mock("@redux/backend/convex/_generated/api", () => ({
  api: { functions: { billing: { getCurrentBillingState: {} } } },
}));
vi.mock("@/lib/auth/server", () => ({
  getRequestUserIdFromHeaders: mocks.getRequestUserIdFromHeaders,
  fetchAuthQuery: mocks.fetchAuthQuery,
}));

describe("OAuth HTTP guards", () => {
  beforeEach(() => {
    mocks.getRequestUserIdFromHeaders.mockResolvedValue("user-a");
    mocks.fetchAuthQuery.mockResolvedValue({ entitlements: { byok: true } });
  });

  it("requires an exact Origin header for mutating requests", () => {
    expect(
      isSameOrigin(
        new Request("https://redux.example/api/byok/oauth/chatgpt/start", {
          method: "POST",
          headers: { Origin: "https://redux.example" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("https://redux.example/api/byok/oauth/chatgpt/start", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(
        new Request("https://redux.example/api/byok/oauth/chatgpt/start", {
          method: "POST",
        }),
      ),
    ).toBe(false);
  });

  it("allows a missing Origin only for legacy credential requests", () => {
    expect(
      isSameOriginOrMissing(
        new Request("https://redux.example/api/byok/credentials/openai", {
          method: "PUT",
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginOrMissing(
        new Request("https://redux.example/api/byok/credentials/openai", {
          method: "PUT",
          headers: { Origin: "https://redux.example" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginOrMissing(
        new Request("https://redux.example/api/byok/credentials/openai", {
          method: "PUT",
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects signed-out users before checking entitlement", async () => {
    mocks.getRequestUserIdFromHeaders.mockResolvedValue(undefined);

    const result = await requireByokUser(
      new Request("https://redux.example/api/byok/oauth/chatgpt/start"),
    );

    expect("response" in result && result.response.status).toBe(401);
    expect(mocks.fetchAuthQuery).not.toHaveBeenCalled();
  });

  it("requires the paid BYOK entitlement for OAuth mutation", async () => {
    mocks.fetchAuthQuery.mockResolvedValue({ entitlements: { byok: false } });

    const result = await requireByokUser(
      new Request("https://redux.example/api/byok/oauth/chatgpt/start"),
    );

    expect("response" in result && result.response.status).toBe(403);
  });

  it("notifies the exact-origin opener when callback authentication fails", async () => {
    const response = oauthAuthFailureResponse({
      request: new Request(
        "https://redux.example/api/byok/oauth/openrouter/callback?flow=flow-123",
      ),
      connector: "openrouter",
      authResponse: new Response("Unauthorized", { status: 401 }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe("text/html");
    const html = await response.text();
    expect(html).toContain('"byok-oauth-complete"');
    expect(html).toContain('"openrouter"');
    expect(html).toContain('"flowId":"flow-123"');
    expect(html).toContain('"https://redux.example"');
    expect(html).toContain("redux-chat:byok-oauth:openrouter:flow-123");
    expect(html).toContain("redux-chat:byok-oauth-result:openrouter:flow-123");
    expect(html).toContain("localStorage.setItem");
    expect(html).toContain("new BroadcastChannel(channelName)");
    expect(html).toContain("window.opener.postMessage");
    expect(html).toContain("setTimeout(() => window.close(), 1500)");
    expect(html).toContain("Sign in to Redux Chat");
  });
});
