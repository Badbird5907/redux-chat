import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_ROUTING_CONFIG,
  generationRequiresPlatformCredits,
  providerPriorityForPreset,
  resolveEffectiveModelRoute,
  sanitizeModelRoutingConfig,
} from "./routing";

const MODEL_ID = "openai/gpt-5.6-sol";
const all = (...providers: ("openai" | "openrouter")[]) =>
  new Map(providers.map((provider) => [provider, { kind: "all" as const }]));

describe("model routing", () => {
  it("prefers a native user key over OpenRouter by default", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: DEFAULT_MODEL_ROUTING_CONFIG,
      availability: all("openai", "openrouter"),
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
      availability: all("openai", "openrouter"),
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
      availability: all("openai"),
      byokEnabled: true,
    });

    expect(resolved?.fundingSource).toBe("platform");
    expect(resolved?.reason).toBe("override");
  });

  it("honors a hosted override when global fallback is disabled", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: {
        ...DEFAULT_MODEL_ROUTING_CONFIG,
        hostedFallback: false,
        overrides: [{ modelId: MODEL_ID, kind: "hosted" }],
      },
      availability: all("openai"),
      byokEnabled: true,
    });

    expect(resolved?.fundingSource).toBe("platform");
    expect(resolved?.reason).toBe("override");
  });

  it("returns no route when fallback is disabled and no key is available", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: { ...DEFAULT_MODEL_ROUTING_CONFIG, hostedFallback: false },
      availability: new Map(),
      byokEnabled: true,
    });

    expect(resolved).toBeUndefined();
  });

  it("uses only ChatGPT-discovered OpenAI models", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: DEFAULT_MODEL_ROUTING_CONFIG,
      availability: new Map([
        [
          "openai",
          {
            kind: "models" as const,
            modelIds: new Set(["gpt-5.5"]),
            supportsImageGeneration: true,
          },
        ],
        ["openrouter", { kind: "all" as const }],
      ]),
      byokEnabled: true,
    });

    expect(resolved?.route.id).toBe("openrouter:openai/gpt-5.6-sol");
  });

  it("makes OpenAI image routes available through ChatGPT", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: "openai/gpt-image-2",
      config: DEFAULT_MODEL_ROUTING_CONFIG,
      availability: new Map([
        [
          "openai",
          {
            kind: "models" as const,
            modelIds: new Set(["gpt-5.5"]),
            supportsImageGeneration: true,
          },
        ],
      ]),
      byokEnabled: true,
    });

    expect(resolved?.route.id).toBe("openai:gpt-image-2");
    expect(resolved?.fundingSource).toBe("user");
  });

  it("falls back when ChatGPT image generation is unavailable", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: "openai/gpt-image-2",
      config: DEFAULT_MODEL_ROUTING_CONFIG,
      availability: new Map([
        [
          "openai",
          {
            kind: "models" as const,
            modelIds: new Set(["gpt-5.5"]),
            supportsImageGeneration: false,
          },
        ],
      ]),
      byokEnabled: true,
    });

    expect(resolved?.fundingSource).toBe("platform");
  });

  it("ignores an explicit override that the current connection cannot serve", () => {
    const resolved = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: {
        ...DEFAULT_MODEL_ROUTING_CONFIG,
        overrides: [
          {
            modelId: MODEL_ID,
            kind: "byok",
            routeId: "openai:gpt-5.6-sol",
          },
        ],
      },
      availability: new Map([
        [
          "openai",
          {
            kind: "models" as const,
            modelIds: new Set(["gpt-5.5"]),
            supportsImageGeneration: true,
          },
        ],
        ["openrouter", { kind: "all" as const }],
      ]),
      byokEnabled: true,
    });

    expect(resolved?.route.id).toBe("openrouter:openai/gpt-5.6-sol");
    expect(resolved?.reason).toBe("priority");
  });

  it("changes effective routes immediately when a connection is replaced", () => {
    const unrestricted = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: DEFAULT_MODEL_ROUTING_CONFIG,
      availability: all("openai", "openrouter"),
      byokEnabled: true,
    });
    const restricted = resolveEffectiveModelRoute({
      modelId: MODEL_ID,
      config: DEFAULT_MODEL_ROUTING_CONFIG,
      availability: new Map([
        [
          "openai",
          {
            kind: "models" as const,
            modelIds: new Set(["gpt-5.5"]),
            supportsImageGeneration: true,
          },
        ],
        ["openrouter", { kind: "all" as const }],
      ]),
      byokEnabled: true,
    });

    expect(unrestricted?.route.id).toBe("openai:gpt-5.6-sol");
    expect(restricted?.route.id).toBe("openrouter:openai/gpt-5.6-sol");
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

describe("generationRequiresPlatformCredits", () => {
  it("does not require credits for a user-funded model without paid tools", () => {
    expect(
      generationRequiresPlatformCredits({
        mainFundingSource: "user",
        canInvokeTools: true,
        searchEnabled: false,
        analysisWorkspaceEnabled: false,
        imageToolFundingSource: "user",
      }),
    ).toBe(false);
  });

  it("requires credits for a platform-funded main model", () => {
    expect(
      generationRequiresPlatformCredits({
        mainFundingSource: "platform",
        canInvokeTools: true,
        searchEnabled: false,
        analysisWorkspaceEnabled: false,
      }),
    ).toBe(true);
  });

  it.each([
    {
      label: "search",
      searchEnabled: true,
      analysisWorkspaceEnabled: false,
      imageToolFundingSource: undefined,
    },
    {
      label: "analysis workspace",
      searchEnabled: false,
      analysisWorkspaceEnabled: true,
      imageToolFundingSource: undefined,
    },
    {
      label: "platform-funded image generation",
      searchEnabled: false,
      analysisWorkspaceEnabled: false,
      imageToolFundingSource: "platform" as const,
    },
  ])("requires credits for $label", (toolState) => {
    expect(
      generationRequiresPlatformCredits({
        mainFundingSource: "user",
        canInvokeTools: true,
        searchEnabled: toolState.searchEnabled,
        analysisWorkspaceEnabled: toolState.analysisWorkspaceEnabled,
        imageToolFundingSource: toolState.imageToolFundingSource,
      }),
    ).toBe(true);
  });

  it("ignores tool flags when the main model cannot invoke tools", () => {
    expect(
      generationRequiresPlatformCredits({
        mainFundingSource: "user",
        canInvokeTools: false,
        searchEnabled: true,
        analysisWorkspaceEnabled: true,
        imageToolFundingSource: "platform",
      }),
    ).toBe(false);
  });
});
