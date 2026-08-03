import { describe, expect, it } from "vitest";

import type { PendingOpenRouterFlow } from "./openrouter-pending-flow";
import { getOpenRouterCredentialCompletion } from "./openrouter-pending-flow";

const firstConnectionFlow: PendingOpenRouterFlow = {
  flowId: "flow-1",
  authorizationUrl: "https://openrouter.ai/auth",
  expiresAt: Date.now() + 60_000,
  previousCredentialUpdatedAt: null,
};

describe("getOpenRouterCredentialCompletion", () => {
  it("treats a first credential as a successful pending flow completion", () => {
    expect(
      getOpenRouterCredentialCompletion(firstConnectionFlow, {
        updatedAt: 100,
      }),
    ).toEqual({
      type: "byok-oauth-complete",
      connector: "openrouter",
      flowId: "flow-1",
      success: true,
    });
  });

  it("does not complete while the prior credential is unchanged", () => {
    expect(
      getOpenRouterCredentialCompletion(
        {
          ...firstConnectionFlow,
          previousCredentialUpdatedAt: 100,
        },
        { updatedAt: 100 },
      ),
    ).toBeUndefined();
  });

  it("completes when an existing credential is replaced", () => {
    expect(
      getOpenRouterCredentialCompletion(
        {
          ...firstConnectionFlow,
          previousCredentialUpdatedAt: 100,
        },
        { updatedAt: 101 },
      ),
    ).toMatchObject({ success: true });
  });
});
