import { describe, expect, it } from "vitest";

import {
  calculateCreditsFromUsd,
  calculatePurchasedCreditsFromCents,
  calculateToolUsdCost,
  calculateUsageCharge,
  DEFAULT_BILLING_CONFIG,
  getToolBillingConfig,
  getUsageTokenEquivalent,
} from "./billing";

describe("billing helpers", () => {
  it("treats mcp tool calls as enabled and free", () => {
    const toolConfig = getToolBillingConfig("mcp:exa");

    expect(toolConfig).toEqual({
      rawUsdPerCall: 0,
      enabled: true,
    });
  });

  it("aggregates known tool usage cost", () => {
    const usdCost = calculateToolUsdCost([
      { billingKey: "search", invocationCount: 2 },
      { billingKey: "analysis_workspace", invocationCount: 1 },
      { billingKey: "search_project_knowledge", invocationCount: 4 },
      { billingKey: "search", invocationCount: 0 },
    ]);

    expect(usdCost).toBeCloseTo(0.034);
  });

  it("rounds credits up to the nearest integer", () => {
    const credits = calculateCreditsFromUsd(0.0000051, 2);

    expect(credits).toBe(3);
  });

  it("converts top-up dollars to purchased credits using the configured exchange rate", () => {
    expect(calculatePurchasedCreditsFromCents(500)).toBe(1_000_000);
    expect(calculatePurchasedCreditsFromCents(1_000)).toBe(2_000_000);
  });

  it("derives monthly effective usage value from included credits", () => {
    expect(
      DEFAULT_BILLING_CONFIG.plans.free.includedMonthlyCredits *
        DEFAULT_BILLING_CONFIG.creditUsdValue,
    ).toBeCloseTo(0.5);
    expect(
      DEFAULT_BILLING_CONFIG.plans.plus.includedMonthlyCredits *
        DEFAULT_BILLING_CONFIG.creditUsdValue,
    ).toBeCloseTo(5);
    expect(
      DEFAULT_BILLING_CONFIG.plans.pro.includedMonthlyCredits *
        DEFAULT_BILLING_CONFIG.creditUsdValue,
    ).toBeCloseTo(17.5);
  });

  it("rejects non-integer top-up cent amounts", () => {
    expect(() => calculatePurchasedCreditsFromCents(500.5)).toThrow(
      /integer number of cents/,
    );
  });

  it("blocks paid plans at zero credits instead of allowing overages", () => {
    expect(DEFAULT_BILLING_CONFIG.plans.plus.overageAllowed).toBe(false);
    expect(DEFAULT_BILLING_CONFIG.plans.pro.overageAllowed).toBe(false);
  });

  it("returns 0 credits when provider reports zero usage tokens", () => {
    // This documents the known issue: when a provider (e.g. OpenRouter) reports
    // all-zero tokens because the upstream model didn't return usage data,
    // calculateUsageCharge computes 0 credits. The recordUsageEvent handler
    // compensates by enforcing a minimum charge of 1 credit.
    const charge = calculateUsageCharge(
      {
        routeId: "openrouter:deepseek/deepseek-v4-flash",
        usage: { inputTokens: 0, outputTokens: 0 },
        tier: "plus",
      },
      DEFAULT_BILLING_CONFIG,
    );

    expect(charge.credits).toBe(0);
    expect(getUsageTokenEquivalent({ inputTokens: 0, outputTokens: 0 })).toBe(
      0,
    );
  });

  it("charges credits correctly when provider reports actual usage", () => {
    const charge = calculateUsageCharge(
      {
        routeId: "openrouter:deepseek/deepseek-v4-flash",
        usage: { inputTokens: 1000, outputTokens: 500 },
        tier: "plus",
      },
      DEFAULT_BILLING_CONFIG,
    );

    expect(charge.credits).toBeGreaterThan(0);
  });
});
