import type {
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type Stripe from "stripe";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type {
  PromotionKind,
  PromotionStatus,
  PromotionSubscriptionTier,
  SubscriptionPromotionConfig,
} from "@redux/shared";
import {
  canRedeemForUserCount,
  formatPerUserRedemptionPolicy,
  formatPromotionBenefit,
  getPromotionRedeemableTiers,
  isFullDiscount,
} from "@redux/shared";

import type { DataModel } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { authComponent } from "../auth";
import { revokeCreditGrantForUserTx } from "../credits";
import { backendEnv } from "../env";
import {
  assertAppCreditsConfig,
  assertPromotionRedeemable,
  assertStripeInvoiceCreditPromotionConfig,
  assertSubscriptionPromotionConfig,
  assertValidPromotionWindow,
  assertValidRedemptionLimits,
  normalizePromotionCode,
  resolveAppCreditExpiry,
} from "../promotions";
import { getStripeSdkClient, priceIdForTier } from "../stripe";
import { action, adminMutation, adminQuery, query } from "./index";
import { internalMutation, internalQuery } from "./internal";

const promotionKindValidator = v.union(
  v.literal("app_credits"),
  v.literal("subscription_discount"),
  v.literal("stripe_invoice_credit"),
);

const promotionStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("archived"),
);

const promotionRedemptionStatusValidator = v.union(
  v.literal("reserved"),
  v.literal("pending_checkout"),
  v.literal("applied"),
  v.literal("failed"),
  v.literal("revoked"),
);

const paidPlanTierValidator = v.union(v.literal("plus"), v.literal("pro"));

const appCreditsConfigValidator = v.object({
  amount: v.number(),
  expiresAt: v.optional(v.number()),
  expiresAfterDays: v.optional(v.number()),
  note: v.optional(v.string()),
});

const promotionConfigValidator = v.any();
const STRIPE_NETWORK_TIMEOUT_MS = 10_000;

type PromotionDoc = DataModel["promotions"]["document"];
type RedemptionDoc = DataModel["promotionRedemptions"]["document"];
type PromotionActionCtx = GenericActionCtx<DataModel> & { userId: string };
type PromotionConfigSnapshot =
  | {
      kind: "app_credits";
      config: {
        amount: number;
        expiresAt?: number;
        expiresAfterDays?: number;
        note?: string;
      };
    }
  | { kind: "subscription_discount"; config: SubscriptionPromotionConfig }
  | {
      kind: "stripe_invoice_credit";
      config: {
        amountCents: number;
        currency: "usd";
        description?: string;
      };
    };

type ReservationSnapshot = {
  promotion: {
    promotionId: string;
    code: string;
    codeNormalized: string;
    name: string;
    kind: PromotionKind;
    metadata: unknown;
  };
  redemption: {
    redemptionId: string;
    userId: string;
    targetTier: PromotionSubscriptionTier | undefined;
  };
};

type AppCreditsAppliedResult = {
  type: "app_credits_applied";
  status: "applied";
  kind: "app_credits";
  promotionId: string;
  redemptionId: string;
  grantId: string;
  amount: number;
  expiresAt: number | undefined;
};

type InvoiceCreditAppliedResult = {
  type: "invoice_credit_applied";
  status: "applied";
  kind: "stripe_invoice_credit";
  promotionId: string;
  redemptionId: string;
  amountCents: number;
  currency: "usd";
  stripeCustomerBalanceTransactionId: string;
};

type SubscriptionAppliedResult = {
  type: "subscription_applied";
  status: "applied";
  kind: "subscription_discount";
  promotionId: string;
  redemptionId: string;
  targetTier: PromotionSubscriptionTier;
  stripeSubscriptionId: string;
  freeUntil?: number;
};

type CheckoutRedirectResult = {
  type: "checkout_redirect";
  status: "pending_checkout";
  kind: "subscription_discount";
  promotionId: string;
  redemptionId: string;
  url: string;
};

type RedeemPromotionResult =
  | AppCreditsAppliedResult
  | InvoiceCreditAppliedResult
  | SubscriptionAppliedResult
  | CheckoutRedirectResult;

async function assertActionUserIsAdmin(ctx: PromotionActionCtx): Promise<void> {
  const me = await authComponent.getAuthUser(ctx);
  const roleField = (me as { role?: string | null }).role;
  const roles =
    roleField == null || roleField === ""
      ? ["user"]
      : roleField
          .split(",")
          .map((role) => role.trim())
          .filter((role) => role.length > 0);
  if (!roles.includes("admin")) {
    throw new Error("Forbidden");
  }
}

function getPromotionConfig(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object") return undefined;
  return (metadata as { config?: unknown }).config;
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

async function getPromotionByPromotionId(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  promotionId: string,
) {
  return await ctx.db
    .query("promotions")
    .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
    .unique();
}

async function getPromotionByCodeNormalized(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  codeNormalized: string,
) {
  return await ctx.db
    .query("promotions")
    .withIndex("by_codeNormalized", (q) =>
      q.eq("codeNormalized", codeNormalized),
    )
    .unique();
}

function getValidatedPromotionConfig(
  promotion: Pick<PromotionDoc, "kind" | "metadata">,
): PromotionConfigSnapshot {
  const config = getPromotionConfig(promotion.metadata);
  if (promotion.kind === "app_credits") {
    assertAppCreditsConfig(config);
    return { kind: "app_credits", config };
  }
  if (promotion.kind === "subscription_discount") {
    assertSubscriptionPromotionConfig(config);
    return { kind: "subscription_discount", config };
  }
  assertStripeInvoiceCreditPromotionConfig(config);
  return { kind: "stripe_invoice_credit", config };
}

function resolveTargetTier(
  config: SubscriptionPromotionConfig,
  requested: PromotionSubscriptionTier | undefined,
): PromotionSubscriptionTier {
  const tiers = getPromotionRedeemableTiers(config);
  if (requested === undefined) {
    const onlyTier = tiers[0];
    if (tiers.length === 1 && onlyTier !== undefined) return onlyTier;
    throw new ConvexError("Choose a subscription tier for this promotion.");
  }
  if (!tiers.includes(requested)) {
    throw new ConvexError("This promotion cannot be redeemed for that tier.");
  }
  return requested;
}

function promotionPreview(promotion: PromotionDoc) {
  let benefit = "Promotion";
  let redeemableTargetTiers: PromotionSubscriptionTier[] = [];
  let subscriptionMode: "discount" | "gifted_subscription" | undefined;
  let requiresCheckout = false;
  try {
    const config = getValidatedPromotionConfig(promotion);
    benefit = formatPromotionBenefit(config);
    if (config.kind === "subscription_discount") {
      redeemableTargetTiers = getPromotionRedeemableTiers(config.config);
      subscriptionMode = config.config.mode;
      requiresCheckout = !(
        config.config.mode === "gifted_subscription" ||
        isFullDiscount(config.config)
      );
    }
  } catch {
    benefit = "Promotion configuration is invalid";
  }

  return {
    promotionId: promotion.promotionId,
    code: promotion.code,
    name: promotion.name,
    description: promotion.description,
    status: promotion.status,
    kind: promotion.kind,
    maxRedemptions: promotion.maxRedemptions,
    redeemedCount: promotion.redeemedCount,
    perUserRedemptionLimit: promotion.perUserRedemptionLimit,
    perUserRedemptionLabel: formatPerUserRedemptionPolicy(
      promotion.perUserRedemptionLimit,
    ),
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    configSummary: benefit,
    redeemableTargetTiers,
    requiresTargetTierSelection: redeemableTargetTiers.length > 1,
    subscriptionMode,
    requiresCheckout,
  };
}

export const getPromotionByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const codeNormalized = normalizePromotionCode(args.code);
    const promotion = await getPromotionByCodeNormalized(ctx, codeNormalized);
    if (!promotion) return null;

    const existing = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_user_promotion", (q) =>
        q.eq("userId", ctx.userId).eq("promotionId", promotion.promotionId),
      )
      .collect();
    const consumed = existing.filter(
      (r) =>
        r.status === "reserved" ||
        r.status === "pending_checkout" ||
        r.status === "applied",
    ).length;
    const now = Date.now();
    const globalLimitReached =
      promotion.maxRedemptions !== undefined &&
      promotion.redeemedCount >= promotion.maxRedemptions;
    const canRedeemForUser = canRedeemForUserCount({
      existingRedemptionCount: consumed,
      perUserRedemptionLimit: promotion.perUserRedemptionLimit,
    });
    const ineligibleReason =
      promotion.status !== "active"
        ? "This promotion is not active."
        : promotion.startsAt !== undefined && promotion.startsAt > now
          ? "This promotion is not available yet."
          : promotion.endsAt !== undefined && promotion.endsAt <= now
            ? "This promotion has expired."
            : globalLimitReached
              ? "This promotion has reached its redemption limit."
              : !canRedeemForUser
                ? "You already redeemed this promotion."
                : undefined;

    return {
      ...promotionPreview(promotion),
      userRedemptionCount: consumed,
      canRedeem: ineligibleReason === undefined,
      ineligibleReason,
    };
  },
});

export const redeemPromotion = action({
  args: {
    code: v.string(),
    targetTier: v.optional(paidPlanTierValidator),
  },
  handler: async (ctx, args): Promise<RedeemPromotionResult> => {
    const reservation: ReservationSnapshot = await ctx.runMutation(
      internal.functions.promotions.internal_reservePromotionRedemption,
      {
        code: args.code,
        userId: ctx.userId,
        targetTier: args.targetTier,
      },
    );

    const promotionConfig = getValidatedPromotionConfig(reservation.promotion);
    try {
      if (promotionConfig.kind === "app_credits") {
        return await applyAppCreditsPromotion(
          ctx,
          reservation,
          promotionConfig,
        );
      }
      if (promotionConfig.kind === "stripe_invoice_credit") {
        return await applyInvoiceCreditPromotion(
          ctx,
          reservation,
          promotionConfig,
        );
      }
      return await applySubscriptionPromotion(
        ctx,
        reservation,
        promotionConfig,
      );
    } catch (error) {
      await ctx.runMutation(
        internal.functions.promotions.internal_markPromotionRedemptionFailed,
        {
          promotionId: reservation.promotion.promotionId,
          redemptionId: reservation.redemption.redemptionId,
          failureReason:
            error instanceof Error
              ? error.message
              : "Failed to apply promotion.",
          releaseRedemption: true,
        },
      );
      throw error;
    }
  },
});

async function applyAppCreditsPromotion(
  ctx: PromotionActionCtx,
  reservation: ReservationSnapshot,
  promotionConfig: Extract<PromotionConfigSnapshot, { kind: "app_credits" }>,
): Promise<AppCreditsAppliedResult> {
  const now = Date.now();
  const expiresAt = resolveAppCreditExpiry({
    expiresAt: promotionConfig.config.expiresAt,
    expiresAfterDays: promotionConfig.config.expiresAfterDays,
    nowMs: now,
  });
  const grant: { grantId: string } = await ctx.runMutation(
    internal.functions.credits.internal_grantCredits,
    {
      userId: reservation.redemption.userId,
      bucket: "gifted",
      amount: promotionConfig.config.amount,
      source: "promotion",
      sourceId: `promotion:${reservation.promotion.promotionId}:${reservation.redemption.redemptionId}`,
      expiresAt,
      metadata: {
        promotionId: reservation.promotion.promotionId,
        code: reservation.promotion.code,
        redemptionId: reservation.redemption.redemptionId,
        note: promotionConfig.config.note,
      },
    },
  );

  await ctx.runMutation(
    internal.functions.promotions.internal_markPromotionRedemptionApplied,
    {
      redemptionId: reservation.redemption.redemptionId,
      appCreditGrantId: grant.grantId,
      metadata: {
        promotionName: reservation.promotion.name,
        amount: promotionConfig.config.amount,
        expiresAt,
      },
    },
  );

  return {
    type: "app_credits_applied" as const,
    status: "applied" as const,
    kind: "app_credits" as const,
    promotionId: reservation.promotion.promotionId,
    redemptionId: reservation.redemption.redemptionId,
    grantId: grant.grantId,
    amount: promotionConfig.config.amount,
    expiresAt,
  };
}

async function applyInvoiceCreditPromotion(
  ctx: PromotionActionCtx,
  reservation: ReservationSnapshot,
  promotionConfig: Extract<
    PromotionConfigSnapshot,
    { kind: "stripe_invoice_credit" }
  >,
): Promise<InvoiceCreditAppliedResult> {
  const customerId: string = await ensureCurrentStripeCustomer(ctx);
  const stripe = getStripeSdkClient();
  const transaction: Stripe.CustomerBalanceTransaction = await withTimeout(
    stripe.customers.createBalanceTransaction(customerId, {
      amount: -promotionConfig.config.amountCents,
      currency: promotionConfig.config.currency,
      description:
        promotionConfig.config.description ??
        `Promotion ${reservation.promotion.code}`,
      metadata: stripeMetadata({
        kind: "promotion_invoice_credit",
        promotionId: reservation.promotion.promotionId,
        redemptionId: reservation.redemption.redemptionId,
        userId: reservation.redemption.userId,
        code: reservation.promotion.code,
      }),
    }),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.customers.createBalanceTransaction",
  );

  await ctx.runMutation(
    internal.functions.promotions.internal_markPromotionRedemptionApplied,
    {
      redemptionId: reservation.redemption.redemptionId,
      stripeCustomerId: customerId,
      stripeCustomerBalanceTransactionId: transaction.id,
      metadata: {
        promotionName: reservation.promotion.name,
        amountCents: promotionConfig.config.amountCents,
        currency: promotionConfig.config.currency,
      },
    },
  );

  return {
    type: "invoice_credit_applied" as const,
    status: "applied" as const,
    kind: "stripe_invoice_credit" as const,
    promotionId: reservation.promotion.promotionId,
    redemptionId: reservation.redemption.redemptionId,
    amountCents: promotionConfig.config.amountCents,
    currency: promotionConfig.config.currency,
    stripeCustomerBalanceTransactionId: transaction.id,
  };
}

async function applySubscriptionPromotion(
  ctx: PromotionActionCtx,
  reservation: ReservationSnapshot,
  promotionConfig: Extract<
    PromotionConfigSnapshot,
    { kind: "subscription_discount" }
  >,
): Promise<SubscriptionAppliedResult | CheckoutRedirectResult> {
  const targetTier = reservation.redemption.targetTier;
  if (!targetTier) {
    throw new Error("Subscription target tier is required.");
  }

  const billingState: {
    tier: string;
    subscription?: {
      subscriptionId?: string;
      customerId?: string;
      priceId?: string;
      status?: string;
      currentPeriodEnd?: number;
      cancelAtPeriodEnd?: boolean;
    } | null;
  } = await ctx.runQuery(api.functions.billing.getCurrentBillingState, {});
  if (
    billingState.tier !== "free" &&
    promotionConfig.config.freeUsersOnly !== false
  ) {
    throw new Error(
      "Subscription promotions are only available to free users.",
    );
  }

  const customerId = await ensureCurrentStripeCustomer(ctx);
  const priceId = priceIdForTier(targetTier);
  if (!priceId) {
    throw new Error("That subscription tier is not configured.");
  }

  const stripe = getStripeSdkClient();

  if (billingState.tier !== "free") {
    return await applySubscriptionPromotionToPaidSubscriber(ctx, {
      reservation,
      promotionConfig,
      targetTier,
      customerId,
      priceId,
      billingState,
      stripe,
    });
  }

  const coupon = await createPromotionCoupon(stripe, {
    promotion: reservation.promotion,
    redemption: reservation.redemption,
    config: promotionConfig.config,
    targetTier,
  });

  const metadata = stripeMetadata({
    kind: "promotion_subscription",
    promotionId: reservation.promotion.promotionId,
    redemptionId: reservation.redemption.redemptionId,
    userId: reservation.redemption.userId,
    targetTier,
    tier: targetTier,
    priceId,
    couponId: coupon.id,
  });

  if (
    promotionConfig.config.mode === "gifted_subscription" ||
    isFullDiscount(promotionConfig.config)
  ) {
    const cancelConfig = await subscriptionCancellationParamsForGift(
      stripe,
      customerId,
      promotionConfig.config,
    );
    const subscription = await withTimeout(
      stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        discounts: [{ coupon: coupon.id }],
        metadata: { ...metadata, ...cancelConfig.metadata },
        payment_behavior: "allow_incomplete",
        ...cancelConfig.params,
      }),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.subscriptions.create",
    );

    await ctx.runMutation(
      internal.functions.promotions.internal_markPromotionRedemptionApplied,
      {
        redemptionId: reservation.redemption.redemptionId,
        targetTier,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeCouponId: coupon.id,
        metadata: {
          promotionName: reservation.promotion.name,
          targetTier,
          priceId,
          couponId: coupon.id,
          ...cancelConfig.params,
          ...cancelConfig.metadata,
        },
      },
    );

    return {
      type: "subscription_applied" as const,
      status: "applied" as const,
      kind: "subscription_discount" as const,
      promotionId: reservation.promotion.promotionId,
      redemptionId: reservation.redemption.redemptionId,
      targetTier,
      stripeSubscriptionId: subscription.id,
    };
  }

  const env = backendEnv();
  const siteUrl = env.SITE_URL.replace(/\/+$/, "");
  const checkout = await withTimeout(
    stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: reservation.redemption.userId,
      line_items: [{ price: priceId, quantity: 1 }],
      discounts: [{ coupon: coupon.id }],
      success_url: `${siteUrl}/redeem/${reservation.promotion.code}?checkout=success&redemptionId=${reservation.redemption.redemptionId}`,
      cancel_url: `${siteUrl}/redeem/${reservation.promotion.code}?checkout=cancelled&redemptionId=${reservation.redemption.redemptionId}`,
      metadata,
      subscription_data: { metadata },
    }),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.checkout.sessions.create",
  );

  if (!checkout.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  await ctx.runMutation(
    internal.functions.promotions
      .internal_markPromotionRedemptionPendingCheckout,
    {
      redemptionId: reservation.redemption.redemptionId,
      targetTier,
      stripeCustomerId: customerId,
      stripeCouponId: coupon.id,
      stripeCheckoutSessionId: checkout.id,
      stripeCheckoutSessionExpiresAt:
        typeof checkout.expires_at === "number"
          ? checkout.expires_at * 1000
          : undefined,
      metadata: {
        promotionName: reservation.promotion.name,
        targetTier,
        priceId,
        couponId: coupon.id,
      },
    },
  );

  return {
    type: "checkout_redirect" as const,
    status: "pending_checkout" as const,
    kind: "subscription_discount" as const,
    promotionId: reservation.promotion.promotionId,
    redemptionId: reservation.redemption.redemptionId,
    url: checkout.url,
  };
}

async function applySubscriptionPromotionToPaidSubscriber(
  ctx: PromotionActionCtx,
  args: {
    reservation: ReservationSnapshot;
    promotionConfig: Extract<
      PromotionConfigSnapshot,
      { kind: "subscription_discount" }
    >;
    targetTier: PromotionSubscriptionTier;
    customerId: string;
    priceId: string;
    billingState: {
      tier: string;
      subscription?: {
        subscriptionId?: string;
        customerId?: string;
        priceId?: string;
        status?: string;
        currentPeriodEnd?: number;
        cancelAtPeriodEnd?: boolean;
      } | null;
    };
    stripe: Stripe;
  },
): Promise<SubscriptionAppliedResult> {
  const { reservation, promotionConfig, targetTier, billingState, stripe } =
    args;
  const subscription = billingState.subscription;
  const subscriptionId = subscription?.subscriptionId;
  if (!subscriptionId) {
    throw new Error("No active subscription found to extend.");
  }
  if (billingState.tier !== targetTier) {
    throw new Error(
      "Paid subscribers can only claim subscription promotions for their current tier.",
    );
  }
  if (subscription.cancelAtPeriodEnd === true) {
    throw new Error(
      "Resume your subscription before claiming subscription promotion time.",
    );
  }
  if (!isFullDiscount(promotionConfig.config)) {
    throw new Error(
      "Paid subscribers can only claim full-discount subscription promotions.",
    );
  }
  if (promotionConfig.config.duration.type === "forever") {
    throw new Error(
      "Paid subscribers cannot claim forever subscription promotions.",
    );
  }

  const months =
    promotionConfig.config.duration.type === "repeating"
      ? promotionConfig.config.duration.months
      : 1;
  const liveSub = await withTimeout(
    stripe.subscriptions.retrieve(subscriptionId),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.subscriptions.retrieve",
  );
  const item = liveSub.items.data[0];
  if (!item) {
    throw new Error("Subscription has no billable item.");
  }
  if (item.price.id !== args.priceId) {
    throw new Error(
      "Your current subscription tier does not match this promo.",
    );
  }

  const existingTrialEndMs =
    typeof liveSub.trial_end === "number" ? liveSub.trial_end * 1000 : 0;
  const currentPeriodEndMs =
    typeof item.current_period_end === "number"
      ? item.current_period_end * 1000
      : (subscription.currentPeriodEnd ?? 0);
  const extensionStartMs = Math.max(Date.now(), existingTrialEndMs);
  const freeUntilMs = Math.max(
    addUtcMonths(extensionStartMs, months),
    currentPeriodEndMs,
  );

  await withTimeout(
    stripe.subscriptions.update(subscriptionId, {
      trial_end: Math.floor(freeUntilMs / 1000),
      proration_behavior: "none",
      metadata: {
        ...liveSub.metadata,
        promotionId: reservation.promotion.promotionId,
        promotionRedemptionId: reservation.redemption.redemptionId,
        promotionCode: reservation.promotion.code,
        promotionFreeUntilMs: String(freeUntilMs),
      },
    }),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.subscriptions.update",
  );

  await ctx.runMutation(
    internal.functions.promotions.internal_markPromotionRedemptionApplied,
    {
      redemptionId: reservation.redemption.redemptionId,
      targetTier,
      stripeCustomerId: args.customerId,
      stripeSubscriptionId: subscriptionId,
      metadata: {
        promotionName: reservation.promotion.name,
        targetTier,
        priceId: args.priceId,
        paidSubscriberExtension: true,
        extensionMonths: months,
        freeUntilMs,
      },
    },
  );

  return {
    type: "subscription_applied" as const,
    status: "applied" as const,
    kind: "subscription_discount" as const,
    promotionId: reservation.promotion.promotionId,
    redemptionId: reservation.redemption.redemptionId,
    targetTier,
    stripeSubscriptionId: subscriptionId,
    freeUntil: freeUntilMs,
  };
}

export const cancelPendingPromotionCheckout = action({
  args: { redemptionId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.functions.promotions.internal_markPromotionRedemptionFailed,
      {
        redemptionId: args.redemptionId,
        userId: ctx.userId,
        failureReason: "Checkout cancelled.",
        releaseRedemption: true,
        requirePendingCheckout: true,
      },
    );
    return { ok: true };
  },
});

export const adminRevokePromotionStripeInvoiceCredit = action({
  args: { redemptionId: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; reversalId: string }> => {
    await assertActionUserIsAdmin(ctx);
    const redemption: RedemptionDoc | null = await ctx.runQuery(
      internal.functions.promotions.internal_getPromotionRedemptionById,
      { redemptionId: args.redemptionId },
    );
    if (!redemption) {
      throw new Error("Redemption not found.");
    }
    if (!redemption.stripeCustomerId) {
      throw new Error("Redemption has no Stripe customer.");
    }

    const amountCents = metadataNumber(redemption.metadata, "amountCents");
    const currency = metadataString(redemption.metadata, "currency") ?? "usd";
    if (!amountCents || currency !== "usd") {
      throw new Error("Redemption has no reversible invoice credit amount.");
    }

    const stripe = getStripeSdkClient();
    const reversal: Stripe.CustomerBalanceTransaction = await withTimeout(
      stripe.customers.createBalanceTransaction(redemption.stripeCustomerId, {
        amount: amountCents,
        currency,
        description: `Reversal for promotion ${redemption.codeNormalized}`,
        metadata: stripeMetadata({
          kind: "promotion_invoice_credit_reversal",
          redemptionId: redemption.redemptionId,
          promotionId: redemption.promotionId,
          userId: redemption.userId,
          reversal: "true",
        }),
      }),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.customers.createBalanceTransaction.reversal",
    );

    await ctx.runMutation(
      internal.functions.promotions.internal_markPromotionRedemptionRevoked,
      {
        redemptionId: args.redemptionId,
        metadata: {
          reversalCustomerBalanceTransactionId: reversal.id,
        },
      },
    );
    return { ok: true, reversalId: reversal.id };
  },
});

export const adminListPromotions = adminQuery({
  args: {
    status: v.optional(promotionStatusValidator),
    kind: v.optional(promotionKindValidator),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const search = normalizeOptionalText(args.search)?.toLowerCase();
    let results;
    if (args.status !== undefined) {
      const status = args.status;
      results = await ctx.db
        .query("promotions")
        .withIndex("by_status_createdAt", (q) => q.eq("status", status))
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.kind !== undefined) {
      const kind = args.kind;
      results = await ctx.db
        .query("promotions")
        .withIndex("by_kind_createdAt", (q) => q.eq("kind", kind))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      results = await ctx.db
        .query("promotions")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const page = results.page.filter((promotion) => {
      if (args.kind !== undefined && promotion.kind !== args.kind) return false;
      if (search === undefined) return true;
      return (
        promotion.codeNormalized.toLowerCase().includes(search) ||
        promotion.name.toLowerCase().includes(search)
      );
    });

    return {
      ...results,
      page: page.map((promotion) => ({
        ...promotion,
        perUserRedemptionLabel: formatPerUserRedemptionPolicy(
          promotion.perUserRedemptionLimit,
        ),
      })),
    };
  },
});

export const adminGetPromotion = adminQuery({
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    const promotion = await getPromotionByPromotionId(ctx, args.promotionId);
    if (!promotion) {
      throw new ConvexError("Promotion not found.");
    }

    const redemptions = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_promotion_reservedAt", (q) =>
        q.eq("promotionId", args.promotionId),
      )
      .collect();

    const countsByUser = new Map<string, number>();
    for (const redemption of redemptions) {
      if (
        redemption.status !== "reserved" &&
        redemption.status !== "pending_checkout" &&
        redemption.status !== "applied"
      ) {
        continue;
      }
      countsByUser.set(
        redemption.userId,
        (countsByUser.get(redemption.userId) ?? 0) + 1,
      );
    }

    return {
      promotion: {
        ...promotion,
        ...promotionPreview(promotion),
      },
      usageSummary: {
        appliedCount: redemptions.filter((r) => r.status === "applied").length,
        reservedCount: redemptions.filter(
          (r) => r.status === "reserved" || r.status === "pending_checkout",
        ).length,
        failedCount: redemptions.filter((r) => r.status === "failed").length,
        revokedCount: redemptions.filter((r) => r.status === "revoked").length,
        uniqueUserCount: countsByUser.size,
        repeatUserCount: [...countsByUser.values()].filter((count) => count > 1)
          .length,
      },
    };
  },
});

export const adminCreatePromotion = adminMutation({
  args: {
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.optional(promotionStatusValidator),
    kind: promotionKindValidator,
    maxRedemptions: v.optional(v.number()),
    perUserRedemptionLimit: v.optional(v.number()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    appCreditsConfig: v.optional(appCreditsConfigValidator),
    config: v.optional(promotionConfigValidator),
  },
  handler: async (ctx, args) => {
    const codeNormalized = normalizePromotionCode(args.code);
    if (codeNormalized.length < 3) {
      throw new ConvexError("Promotion code is too short.");
    }
    const name = args.name.trim();
    if (name.length === 0) {
      throw new ConvexError("Promotion name is required.");
    }
    assertValidPromotionWindow(args);
    assertValidRedemptionLimits(args);

    const existing = await getPromotionByCodeNormalized(ctx, codeNormalized);
    if (existing) {
      throw new ConvexError("A promotion with this code already exists.");
    }

    const metadata = buildPromotionMetadata(args.kind, {
      appCreditsConfig: args.appCreditsConfig,
      config: args.config as unknown,
    });

    const now = Date.now();
    const promotionId = crypto.randomUUID();
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.insert("promotions", {
      promotionId,
      code: codeNormalized,
      codeNormalized,
      name,
      description: normalizeOptionalText(args.description),
      status: args.status ?? "active",
      kind: args.kind,
      maxRedemptions: args.maxRedemptions,
      perUserRedemptionLimit: args.perUserRedemptionLimit,
      redeemedCount: 0,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      createdByUserId: identity?.subject ?? "admin",
      createdAt: now,
      updatedAt: now,
      metadata,
    });

    return { promotionId };
  },
});

export const adminUpdatePromotion = adminMutation({
  args: {
    promotionId: v.string(),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(promotionStatusValidator),
    kind: v.optional(promotionKindValidator),
    maxRedemptions: v.optional(v.union(v.number(), v.null())),
    perUserRedemptionLimit: v.optional(v.union(v.number(), v.null())),
    startsAt: v.optional(v.union(v.number(), v.null())),
    endsAt: v.optional(v.union(v.number(), v.null())),
    appCreditsConfig: v.optional(appCreditsConfigValidator),
    config: v.optional(promotionConfigValidator),
  },
  handler: async (ctx, args) => {
    const promotion = await getPromotionByPromotionId(ctx, args.promotionId);
    if (!promotion) {
      throw new ConvexError("Promotion not found.");
    }
    const codeNormalized =
      args.code === undefined ? undefined : normalizePromotionCode(args.code);
    if (codeNormalized !== undefined && codeNormalized.length < 3) {
      throw new ConvexError("Promotion code is too short.");
    }
    if (
      codeNormalized !== undefined &&
      codeNormalized !== promotion.codeNormalized
    ) {
      const existing = await getPromotionByCodeNormalized(ctx, codeNormalized);
      if (existing) {
        throw new ConvexError("A promotion with this code already exists.");
      }
    }

    const startsAt = args.startsAt === null ? undefined : args.startsAt;
    const endsAt = args.endsAt === null ? undefined : args.endsAt;
    const maxRedemptions =
      args.maxRedemptions === null ? undefined : args.maxRedemptions;
    const perUserRedemptionLimit =
      args.perUserRedemptionLimit === null
        ? undefined
        : args.perUserRedemptionLimit;

    assertValidPromotionWindow({ startsAt, endsAt });
    assertValidRedemptionLimits({ maxRedemptions, perUserRedemptionLimit });

    const patch: Partial<{
      code: string;
      codeNormalized: string;
      name: string;
      description: string | undefined;
      status: PromotionStatus;
      kind: PromotionKind;
      maxRedemptions: number | undefined;
      perUserRedemptionLimit: number | undefined;
      startsAt: number | undefined;
      endsAt: number | undefined;
      metadata: unknown;
      updatedAt: number;
    }> = { updatedAt: Date.now() };

    if (codeNormalized !== undefined) {
      patch.code = codeNormalized;
      patch.codeNormalized = codeNormalized;
    }
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0)
        throw new ConvexError("Promotion name is required.");
      patch.name = name;
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.maxRedemptions !== undefined) {
      patch.maxRedemptions = maxRedemptions;
    }
    if (args.perUserRedemptionLimit !== undefined) {
      patch.perUserRedemptionLimit = perUserRedemptionLimit;
    }
    if (args.startsAt !== undefined) patch.startsAt = startsAt;
    if (args.endsAt !== undefined) patch.endsAt = endsAt;
    if (
      args.kind !== undefined ||
      args.appCreditsConfig !== undefined ||
      args.config !== undefined
    ) {
      patch.metadata = buildPromotionMetadata(args.kind ?? promotion.kind, {
        appCreditsConfig: args.appCreditsConfig,
        config: args.config as unknown,
      });
    }

    await ctx.db.patch(promotion._id, patch);
    return { ok: true };
  },
});

export const adminPausePromotion = adminMutation({
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    const promotion = await getPromotionByPromotionId(ctx, args.promotionId);
    if (!promotion) throw new ConvexError("Promotion not found.");
    await ctx.db.patch(promotion._id, {
      status: "paused",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const adminResumePromotion = adminMutation({
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    const promotion = await getPromotionByPromotionId(ctx, args.promotionId);
    if (!promotion) throw new ConvexError("Promotion not found.");
    if (promotion.status !== "paused") {
      throw new ConvexError("Only paused promotions can be resumed.");
    }
    await ctx.db.patch(promotion._id, {
      status: "active",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const adminArchivePromotion = adminMutation({
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    const promotion = await getPromotionByPromotionId(ctx, args.promotionId);
    if (!promotion) throw new ConvexError("Promotion not found.");
    await ctx.db.patch(promotion._id, {
      status: "archived",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const adminListPromotionRedemptions = adminQuery({
  args: {
    promotionId: v.string(),
    status: v.optional(promotionRedemptionStatusValidator),
    targetUserId: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    repeatedUsersOnly: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const allForPromotion = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_promotion_reservedAt", (q) =>
        q.eq("promotionId", args.promotionId),
      )
      .collect();

    const consumedCounts = new Map<string, number>();
    for (const redemption of allForPromotion) {
      if (
        redemption.status === "reserved" ||
        redemption.status === "pending_checkout" ||
        redemption.status === "applied"
      ) {
        consumedCounts.set(
          redemption.userId,
          (consumedCounts.get(redemption.userId) ?? 0) + 1,
        );
      }
    }

    const repeatedUsers = new Set(
      [...consumedCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([userId]) => userId),
    );

    const filtered = allForPromotion
      .filter((redemption) => {
        if (args.status !== undefined && redemption.status !== args.status) {
          return false;
        }
        if (
          args.targetUserId !== undefined &&
          !redemption.userId.includes(args.targetUserId)
        ) {
          return false;
        }
        if (args.from !== undefined && redemption.reservedAt < args.from) {
          return false;
        }
        if (args.to !== undefined && redemption.reservedAt > args.to) {
          return false;
        }
        if (
          args.repeatedUsersOnly === true &&
          !repeatedUsers.has(redemption.userId)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.reservedAt - a.reservedAt);

    const start = args.paginationOpts.cursor
      ? Number(args.paginationOpts.cursor)
      : 0;
    const safeStart = Number.isInteger(start) && start >= 0 ? start : 0;
    const page = filtered.slice(
      safeStart,
      safeStart + args.paginationOpts.numItems,
    );
    const next = safeStart + page.length;

    const userIds = [...new Set(page.map((r) => r.userId))];
    const userEmailById = new Map<string, string | null>();
    for (const userId of userIds) {
      const user = await authComponent.getAnyUserById(ctx, userId);
      userEmailById.set(
        userId,
        typeof user?.email === "string" && user.email.length > 0
          ? user.email
          : null,
      );
    }

    return {
      page: page.map((redemption) => ({
        ...redemption,
        isRepeatUser: repeatedUsers.has(redemption.userId),
        userEmail: userEmailById.get(redemption.userId) ?? null,
      })),
      isDone: next >= filtered.length,
      continueCursor: String(next),
    };
  },
});

export const adminRevokePromotionAppCreditGrant = adminMutation({
  args: { redemptionId: v.string() },
  handler: async (ctx, args) => {
    const redemption = await getRedemptionByRedemptionId(
      ctx,
      args.redemptionId,
    );
    if (!redemption) throw new ConvexError("Redemption not found.");
    if (!redemption.appCreditGrantId) {
      throw new ConvexError("This redemption has no app credit grant.");
    }

    await revokeCreditGrantForUserTx(ctx, {
      userId: redemption.userId,
      grantId: redemption.appCreditGrantId,
      reason: "promotion_revoke",
    });

    await ctx.db.patch(redemption._id, {
      status: "revoked",
      revokedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const internal_reservePromotionRedemption = internalMutation({
  args: {
    code: v.string(),
    userId: v.string(),
    targetTier: v.optional(paidPlanTierValidator),
  },
  handler: async (ctx, args): Promise<ReservationSnapshot> => {
    const now = Date.now();
    const codeNormalized = normalizePromotionCode(args.code);
    const promotion = await getPromotionByCodeNormalized(ctx, codeNormalized);
    if (!promotion) {
      throw new ConvexError("Promotion not found.");
    }

    const existing = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_user_promotion", (q) =>
        q.eq("userId", args.userId).eq("promotionId", promotion.promotionId),
      )
      .collect();
    const consumed = existing.filter(
      (r) =>
        r.status === "reserved" ||
        r.status === "pending_checkout" ||
        r.status === "applied",
    ).length;

    assertPromotionRedeemable({
      status: promotion.status,
      redeemedCount: promotion.redeemedCount,
      maxRedemptions: promotion.maxRedemptions,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      existingUserRedemptionCount: consumed,
      perUserRedemptionLimit: promotion.perUserRedemptionLimit,
      nowMs: now,
    });

    let targetTier: PromotionSubscriptionTier | undefined;
    const config = getValidatedPromotionConfig(promotion);
    if (config.kind === "subscription_discount") {
      targetTier = resolveTargetTier(config.config, args.targetTier);
    }

    const redemptionId = crypto.randomUUID();
    await ctx.db.insert("promotionRedemptions", {
      redemptionId,
      promotionId: promotion.promotionId,
      codeNormalized,
      userId: args.userId,
      status: "reserved",
      kind: promotion.kind,
      targetTier,
      reservedAt: now,
      metadata: {
        promotionName: promotion.name,
      },
    });

    await ctx.db.patch(promotion._id, {
      redeemedCount: promotion.redeemedCount + 1,
      updatedAt: now,
    });

    return {
      promotion: {
        promotionId: promotion.promotionId,
        code: promotion.code,
        codeNormalized: promotion.codeNormalized,
        name: promotion.name,
        kind: promotion.kind,
        metadata: promotion.metadata,
      },
      redemption: {
        redemptionId,
        userId: args.userId,
        targetTier,
      },
    };
  },
});

export const internal_markPromotionRedemptionPendingCheckout = internalMutation(
  {
    args: {
      redemptionId: v.string(),
      targetTier: v.optional(paidPlanTierValidator),
      stripeCustomerId: v.optional(v.string()),
      stripeCouponId: v.optional(v.string()),
      stripeCheckoutSessionId: v.optional(v.string()),
      stripeCheckoutSessionExpiresAt: v.optional(v.number()),
      metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
      const redemption = await getRequiredRedemption(ctx, args.redemptionId);
      await ctx.db.patch(redemption._id, {
        status: "pending_checkout",
        targetTier: args.targetTier ?? redemption.targetTier,
        stripeCustomerId: args.stripeCustomerId,
        stripeCouponId: args.stripeCouponId,
        stripeCheckoutSessionId: args.stripeCheckoutSessionId,
        stripeCheckoutSessionExpiresAt: args.stripeCheckoutSessionExpiresAt,
        metadata: mergeMetadata(redemption.metadata, args.metadata),
      });
      return { ok: true };
    },
  },
);

export const internal_markPromotionRedemptionApplied = internalMutation({
  args: {
    redemptionId: v.string(),
    targetTier: v.optional(paidPlanTierValidator),
    appCreditGrantId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripeCouponId: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripeCustomerBalanceTransactionId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const redemption = await getRequiredRedemption(ctx, args.redemptionId);
    await ctx.db.patch(redemption._id, {
      status: "applied",
      appliedAt: Date.now(),
      targetTier: args.targetTier ?? redemption.targetTier,
      appCreditGrantId: args.appCreditGrantId,
      stripeCustomerId: args.stripeCustomerId ?? redemption.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCouponId: args.stripeCouponId ?? redemption.stripeCouponId,
      stripeCheckoutSessionId:
        args.stripeCheckoutSessionId ?? redemption.stripeCheckoutSessionId,
      stripeCustomerBalanceTransactionId:
        args.stripeCustomerBalanceTransactionId,
      metadata: mergeMetadata(redemption.metadata, args.metadata),
    });
    return { ok: true };
  },
});

export const internal_markPromotionRedemptionFailed = internalMutation({
  args: {
    redemptionId: v.string(),
    promotionId: v.optional(v.string()),
    userId: v.optional(v.string()),
    failureReason: v.string(),
    releaseRedemption: v.optional(v.boolean()),
    requirePendingCheckout: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const redemption = await getRequiredRedemption(ctx, args.redemptionId);
    if (args.userId !== undefined && redemption.userId !== args.userId) {
      throw new ConvexError("Redemption not found.");
    }
    if (
      args.requirePendingCheckout === true &&
      redemption.status !== "pending_checkout"
    ) {
      return { ok: true, skipped: true };
    }
    if (redemption.status === "applied" || redemption.status === "revoked") {
      return { ok: true, skipped: true };
    }

    await ctx.db.patch(redemption._id, {
      status: "failed",
      failedAt: Date.now(),
      failureReason: args.failureReason,
    });

    if (args.releaseRedemption === true) {
      const promotionId = args.promotionId ?? redemption.promotionId;
      const promotion = await getPromotionByPromotionId(ctx, promotionId);
      if (promotion) {
        await ctx.db.patch(promotion._id, {
          redeemedCount: Math.max(0, promotion.redeemedCount - 1),
          updatedAt: Date.now(),
        });
      }
    }

    return { ok: true };
  },
});

export const internal_markPromotionRedemptionRevoked = internalMutation({
  args: {
    redemptionId: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const redemption = await getRequiredRedemption(ctx, args.redemptionId);
    await ctx.db.patch(redemption._id, {
      status: "revoked",
      revokedAt: Date.now(),
      metadata: mergeMetadata(redemption.metadata, args.metadata),
    });
    return { ok: true };
  },
});

export const internal_getPromotionRedemptionById = internalQuery({
  args: { redemptionId: v.string() },
  handler: async (ctx, args): Promise<RedemptionDoc | null> => {
    return await getRedemptionByRedemptionId(ctx, args.redemptionId);
  },
});

export const internal_markPromotionCheckoutCompleted = internalMutation({
  args: {
    redemptionId: v.string(),
    userId: v.string(),
    targetTier: paidPlanTierValidator,
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeCheckoutSessionId: v.string(),
    stripeCouponId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const redemption = await getRequiredRedemption(ctx, args.redemptionId);
    if (redemption.userId !== args.userId) {
      throw new ConvexError("Promotion redemption user mismatch.");
    }
    await ctx.db.patch(redemption._id, {
      status: "applied",
      appliedAt: Date.now(),
      targetTier: args.targetTier,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      stripeCouponId: args.stripeCouponId ?? redemption.stripeCouponId,
      metadata: mergeMetadata(redemption.metadata, {
        checkoutStatus: "completed",
      }),
    });
    return { ok: true };
  },
});

async function getRequiredRedemption(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  redemptionId: string,
) {
  const redemption = await getRedemptionByRedemptionId(ctx, redemptionId);
  if (!redemption) {
    throw new ConvexError("Redemption not found.");
  }
  return redemption;
}

async function getRedemptionByRedemptionId(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  redemptionId: string,
) {
  return await ctx.db
    .query("promotionRedemptions")
    .withIndex("by_redemptionId", (q) => q.eq("redemptionId", redemptionId))
    .unique();
}

function buildPromotionMetadata(
  kind: PromotionKind,
  args: { appCreditsConfig?: unknown; config?: unknown },
): { config: unknown } {
  if (kind === "app_credits") {
    const config = args.appCreditsConfig ?? args.config;
    assertAppCreditsConfig(config);
    return { config };
  }
  if (kind === "subscription_discount") {
    assertSubscriptionPromotionConfig(args.config);
    return { config: args.config };
  }
  assertStripeInvoiceCreditPromotionConfig(args.config);
  return { config: args.config };
}

async function ensureCurrentStripeCustomer(
  ctx: PromotionActionCtx,
): Promise<string> {
  const result: { customerId: string } = await ctx.runAction(
    api.functions.billing.ensureCurrentUserStripeCustomer,
    {},
  );
  return result.customerId;
}

async function createPromotionCoupon(
  stripe: Stripe,
  args: {
    promotion: ReservationSnapshot["promotion"];
    redemption: ReservationSnapshot["redemption"];
    config: SubscriptionPromotionConfig;
    targetTier: PromotionSubscriptionTier;
  },
) {
  const duration =
    args.config.duration.type === "repeating"
      ? "repeating"
      : args.config.duration.type;
  const base = {
    name: `${args.promotion.code} ${args.targetTier}`.slice(0, 40),
    duration,
    duration_in_months:
      args.config.duration.type === "repeating"
        ? args.config.duration.months
        : undefined,
    metadata: stripeMetadata({
      kind: "promotion_subscription_coupon",
      promotionId: args.promotion.promotionId,
      redemptionId: args.redemption.redemptionId,
      userId: args.redemption.userId,
      targetTier: args.targetTier,
    }),
  } satisfies Partial<Stripe.CouponCreateParams>;

  const params: Stripe.CouponCreateParams =
    args.config.discount.type === "percent"
      ? {
          ...base,
          duration,
          percent_off: args.config.discount.percentOff,
        }
      : {
          ...base,
          duration,
          amount_off: args.config.discount.amountOffCents,
          currency: args.config.discount.currency,
        };

  return await withTimeout(
    stripe.coupons.create(params),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.coupons.create",
  );
}

async function subscriptionCancellationParamsForGift(
  stripe: Stripe,
  customerId: string,
  config: SubscriptionPromotionConfig,
): Promise<{
  params: Partial<Stripe.SubscriptionCreateParams>;
  metadata: Record<string, string>;
}> {
  if (
    config.cancelIfMissingPaymentMethodAtEnd !== true ||
    config.duration.type === "forever"
  ) {
    return { params: {}, metadata: {} };
  }

  const hasPaymentMethod = await customerHasDefaultPaymentMethod(
    stripe,
    customerId,
  );
  if (hasPaymentMethod) {
    return { params: {}, metadata: {} };
  }

  if (config.duration.type === "once") {
    return {
      params: { cancel_at_period_end: true },
      metadata: {
        promotionCancelIfMissingPaymentMethod: "true",
      },
    };
  }

  const cancelAtMs = addUtcMonths(Date.now(), config.duration.months);
  return {
    params: { cancel_at: Math.floor(cancelAtMs / 1000) },
    metadata: {
      promotionCancelIfMissingPaymentMethod: "true",
      promotionFreeUntilMs: String(cancelAtMs),
    },
  };
}

async function customerHasDefaultPaymentMethod(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  const customer = await withTimeout(
    stripe.customers.retrieve(customerId),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.customers.retrieve",
  );
  if ("deleted" in customer && customer.deleted) {
    return false;
  }
  const defaultPaymentMethod = customer.invoice_settings.default_payment_method;
  return Boolean(defaultPaymentMethod);
}

function stripeMetadata(values: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  );
}

function mergeMetadata(existing: unknown, next: unknown) {
  const existingObject =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : {};
  const nextObject =
    next && typeof next === "object" ? (next as Record<string, unknown>) : {};
  return { ...existingObject, ...nextObject };
}

function metadataNumber(metadata: unknown, key: string): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function metadataString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function addUtcMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
