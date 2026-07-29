import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_ROUTING_CONFIG,
  providerPriorityForPreset,
  resolveEffectiveModelRoute,
  sanitizeModelRoutingConfig,
} from "./routing";

const MODEL_ID = "openai/gpt-5.6-sol";

describe("model routing", () => {
  it("prefers a native user key over OpenRouter by default", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: DEFAULT_MODEL_ROUTING_CONFIG,
      availableProviders: new Set(["openai", "openrouter"]),
      byokEnabled: true,
    });

    expect(resolved?.route.id).toBe("openai:gpt-5.6-sol");
    expect(resolved?.fundingSource).toBe("user");
    expect(resolved?.reason).toBe("priority");
  });

  it("supports OpenRouter-first routing", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: {
        ...DEFAULT_MODEL_ROUTING_CONFIG,
        preset: "openrouter_first",
        providerPriority: providerPriorityForPreset("openrouter_first"),
      },
      availableProviders: new Set(["openai", "openrouter"]),
      byokEnabled: true,
    });

    expect(resolved?.route.id).toBe("openrouter:openai/gpt-5.6-sol");
  });

  it("allows a per-model hosted override", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: {
        ...DEFAULT_MODEL_ROUTING_CONFIG,
        overrides: [{ modelId: MODEL_ID, kind: "hosted" }],
      },
      availableProviders: new Set(["openai"]),
      byokEnabled: true,
    });

    expect(resolved?.fundingSource).toBe("platform");
    expect(resolved?.reason).toBe("override");
  });

  it("returns no route when fallback is disabled and no key is available", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: { ...DEFAULT_MODEL_ROUTING_CONFIG, hostedFallback: false },
      availableProviders: new Set(),
      byokEnabled: true,
    });

    expect(resolved).toBeUndefined();
  });

  it("physically removes stale model and route overrides during sanitization", () => {
    const sanitized = sanitizeModelRoutingConfig({
      ...DEFAULT_MODEL_ROUTING_CONFIG,
      overrides: [
        { modelId: "removed/model", kind: "hosted" },
        { modelId: MODEL_ID, kind: "byok", routeId: "removed:route" },
      ],
    });

    expect(sanitized.overrides).toEqual([]);
  });
});
