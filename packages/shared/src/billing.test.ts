import { describe, expect, it } from "vitest";

import {
  calculateCreditsFromUsd,
  calculateToolUsdCost,
  getToolBillingConfig,
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
});
