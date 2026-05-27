import { describe, expect, it } from "vitest";

import { isPromotionSubscriptionCheckoutComplete } from "./http";

describe("stripe webhook helpers", () => {
  it("accepts paid promotion subscription checkout sessions", () => {
    expect(
      isPromotionSubscriptionCheckoutComplete({
        amount_total: 500,
        payment_status: "paid",
      }),
    ).toBe(true);
  });

  it("accepts zero-dollar promotion subscription checkout sessions", () => {
    expect(
      isPromotionSubscriptionCheckoutComplete({
        amount_total: 0,
        payment_status: "no_payment_required",
      }),
    ).toBe(true);
  });

  it("rejects unpaid promotion subscription checkout sessions", () => {
    expect(
      isPromotionSubscriptionCheckoutComplete({
        amount_total: 500,
        payment_status: "unpaid",
      }),
    ).toBe(false);
  });

  it("rejects no-payment-required sessions with a non-zero total", () => {
    expect(
      isPromotionSubscriptionCheckoutComplete({
        amount_total: 500,
        payment_status: "no_payment_required",
      }),
    ).toBe(false);
  });
});
