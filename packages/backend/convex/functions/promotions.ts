import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { PlanTier } from "@redux/shared";

import type { DataModel, Doc } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { authComponent } from "../auth";
import { getPolarSdkClient } from "../billing";
import { grantCreditsTx } from "../credits";
import { backendEnv } from "../env";
import {
  action,
  adminAction,
  adminMutation,
  adminQuery,
  mutation,
  query,
} from "./index";
import { internalMutation, internalQuery } from "./internal";

const promotionTypeValidator = v.union(
  v.literal("gifted_credits"),
  v.literal("subscription_discount"),
);

const promotionStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("archived"),
);

const subscriptionPromotionTierValidator = v.union(
  v.literal("plus"),
  v.literal("pro"),
);

const creditExpiryPolicyValidator = v.union(
  v.object({ type: v.literal("none") }),
  v.object({ type: v.literal("absolute"), expiresAt: v.number() }),
  v.object({ type: v.literal("relative"), days: v.number() }),
);

const promotionConfigValidator = {
  code: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  type: promotionTypeValidator,
  status: v.optional(promotionStatusValidator),
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
  maxRedemptions: v.optional(v.number()),
  singleUsePerUser: v.optional(v.boolean()),
  newPaidSubscriptionsOnly: v.optional(v.boolean()),
  creditAmount: v.optional(v.number()),
  creditExpiryPolicy: v.optional(creditExpiryPolicyValidator),
  eligibleTiers: v.optional(v.array(subscriptionPromotionTierValidator)),
  discountType: v.optional(
    v.union(v.literal("fixed"), v.literal("percentage")),
  ),
  amountCents: v.optional(v.number()),
  percentBasisPoints: v.optional(v.number()),
  duration: v.optional(
    v.union(v.literal("once"), v.literal("forever"), v.literal("repeating")),
  ),
  durationInMonths: v.optional(v.number()),
};

type PromotionDoc = Doc<"promotions">;
type PromotionRedemptionDoc = Doc<"promotionRedemptions">;
type PromotionType = PromotionDoc["type"];
type PromotionStatus = PromotionDoc["status"];
type SubscriptionPromotionTier = "plus" | "pro";

const CODE_PATTERN = /^[A-Z0-9_-]+$/;
const POLAR_NETWORK_TIMEOUT_MS = 10_000;

type PromotionConfigInput = {
  code: string;
  name: string;
  description?: string;
  type: PromotionType;
  status?: PromotionStatus;
  startsAt?: number;
  endsAt?: number;
  maxRedemptions?: number;
  singleUsePerUser?: boolean;
  newPaidSubscriptionsOnly?: boolean;
  creditAmount?: number;
  creditExpiryPolicy?:
    | { type: "none" }
    | { type: "absolute"; expiresAt: number }
    | { type: "relative"; days: number };
  eligibleTiers?: SubscriptionPromotionTier[];
  discountType?: "fixed" | "percentage";
  amountCents?: number;
  percentBasisPoints?: number;
  duration?: "once" | "forever" | "repeating";
  durationInMonths?: number;
};

type PublicPromotion = {
  promotionId: string;
  code: string;
  name: string;
  description?: string;
  type: PromotionType;
  status: PromotionStatus;
  startsAt?: number;
  endsAt?: number;
  maxRedemptions?: number;
  redemptionCount: number;
  remainingRedemptions?: number;
  singleUsePerUser?: boolean;
  newPaidSubscriptionsOnly?: boolean;
  isRedeemable: boolean;
  blockedReason?: string;
  userRedemptionStatus?: PromotionRedemptionDoc["status"];
  alreadyRedeemed: boolean;
  creditAmount?: number;
  eligibleTiers?: SubscriptionPromotionTier[];
  discountType?: "fixed" | "percentage";
  amountCents?: number;
  percentBasisPoints?: number;
  duration?: "once" | "forever" | "repeating";
  durationInMonths?: number;
  currentTier: PlanTier;
};

function normalizePromotionCode(code: string): string {
  return code.trim().toUpperCase();
}

function validateCommonConfig(input: PromotionConfigInput) {
  const codeNormalized = normalizePromotionCode(input.code);
  if (!CODE_PATTERN.test(codeNormalized)) {
    throw new ConvexError(
      "Codes may contain only letters, numbers, dashes, and underscores.",
    );
  }
  if (input.name.trim().length === 0) {
    throw new ConvexError("Name is required.");
  }
  if (
    input.startsAt !== undefined &&
    input.endsAt !== undefined &&
    input.startsAt >= input.endsAt
  ) {
    throw new ConvexError("Start must be before end.");
  }
  if (
    input.maxRedemptions !== undefined &&
    (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions <= 0)
  ) {
    throw new ConvexError("Max redemptions must be a positive integer.");
  }
  return codeNormalized;
}

function validateGiftedConfig(input: PromotionConfigInput) {
  if (!Number.isInteger(input.creditAmount) || (input.creditAmount ?? 0) <= 0) {
    throw new ConvexError("Gifted credit amount must be a positive integer.");
  }
  const policy = input.creditExpiryPolicy ?? { type: "none" as const };
  if (policy.type === "absolute" && policy.expiresAt <= Date.now()) {
    throw new ConvexError("Credit expiry must be in the future.");
  }
  if (
    policy.type === "relative" &&
    (!Number.isInteger(policy.days) || policy.days <= 0)
  ) {
    throw new ConvexError("Relative credit expiry days must be positive.");
  }
}

function validateSubscriptionConfig(input: PromotionConfigInput) {
  const eligibleTiers = input.eligibleTiers ?? ["plus", "pro"];
  if (eligibleTiers.length === 0) {
    throw new ConvexError("Choose at least one eligible plan.");
  }
  if (input.discountType === "fixed") {
    if (!Number.isInteger(input.amountCents) || (input.amountCents ?? 0) <= 0) {
      throw new ConvexError("Fixed discount amount must be positive cents.");
    }
  } else if (input.discountType === "percentage") {
    if (
      !Number.isInteger(input.percentBasisPoints) ||
      (input.percentBasisPoints ?? 0) <= 0 ||
      (input.percentBasisPoints ?? 0) > 10_000
    ) {
      throw new ConvexError(
        "Percentage discount must be between 0.01% and 100%.",
      );
    }
  } else {
    throw new ConvexError("Discount type is required.");
  }
  const duration = input.duration ?? "once";
  if (
    duration === "repeating" &&
    (!Number.isInteger(input.durationInMonths) ||
      (input.durationInMonths ?? 0) <= 0)
  ) {
    throw new ConvexError(
      "Repeating discounts require a positive month count.",
    );
  }
}

function validatePromotionConfig(input: PromotionConfigInput) {
  const codeNormalized = validateCommonConfig(input);
  if (input.type === "gifted_credits") {
    validateGiftedConfig(input);
  } else {
    validateSubscriptionConfig(input);
  }
  return codeNormalized;
}

function validatePromotionUpdateInput(
  promotion: PromotionDoc,
  incoming: PromotionConfigInput,
) {
  const codeNormalized = validatePromotionConfig({
    ...incoming,
    code: promotion.code,
    type: incoming.type,
  });
  if (codeNormalized !== promotion.codeNormalized) {
    throw new ConvexError("Promotion code cannot be changed.");
  }
  if (incoming.type !== promotion.type) {
    throw new ConvexError("Promotion type cannot be changed.");
  }
}

function getPromotionAvailability(promotion: PromotionDoc, now = Date.now()) {
  if (promotion.status === "archived") {
    return { isRedeemable: false, blockedReason: "archived" };
  }
  if (promotion.status === "paused") {
    return { isRedeemable: false, blockedReason: "paused" };
  }
  if (promotion.startsAt !== undefined && promotion.startsAt > now) {
    return { isRedeemable: false, blockedReason: "not_started" };
  }
  if (promotion.endsAt !== undefined && promotion.endsAt <= now) {
    return { isRedeemable: false, blockedReason: "expired" };
  }
  if (
    promotion.maxRedemptions !== undefined &&
    promotion.redemptionCount >= promotion.maxRedemptions
  ) {
    return { isRedeemable: false, blockedReason: "full" };
  }
  return { isRedeemable: true, blockedReason: undefined };
}

function remainingRedemptions(promotion: PromotionDoc) {
  return promotion.maxRedemptions === undefined
    ? undefined
    : Math.max(0, promotion.maxRedemptions - promotion.redemptionCount);
}

function publicPromotionShape(
  promotion: PromotionDoc,
  userRedemptions: PromotionRedemptionDoc[],
  currentTier: PlanTier,
): PublicPromotion {
  const availability = getPromotionAvailability(promotion);
  const confirmedOrApplied = userRedemptions.find(
    (r) => r.status === "confirmed" || r.status === "applied",
  );
  const singleUsePerUser = promotion.singleUsePerUser ?? true;
  const newPaidSubscriptionsOnly = promotion.newPaidSubscriptionsOnly ?? true;
  const latestRedemption = userRedemptions[0];
  const paidUserOnSubscriptionPromo =
    promotion.type === "subscription_discount" &&
    newPaidSubscriptionsOnly &&
    currentTier !== "free";
  return {
    promotionId: promotion.promotionId,
    code: promotion.code,
    name: promotion.name,
    description: promotion.description,
    type: promotion.type,
    status: promotion.status,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    maxRedemptions: promotion.maxRedemptions,
    redemptionCount: promotion.redemptionCount,
    remainingRedemptions: remainingRedemptions(promotion),
    singleUsePerUser,
    newPaidSubscriptionsOnly,
    isRedeemable: availability.isRedeemable && !paidUserOnSubscriptionPromo,
    blockedReason: paidUserOnSubscriptionPromo
      ? "paid_subscriber"
      : availability.blockedReason,
    userRedemptionStatus: latestRedemption?.status,
    alreadyRedeemed: singleUsePerUser && confirmedOrApplied !== undefined,
    creditAmount:
      promotion.type === "gifted_credits" ? promotion.creditAmount : undefined,
    eligibleTiers: promotion.eligibleTiers,
    discountType: promotion.discountType,
    amountCents: promotion.amountCents,
    percentBasisPoints: promotion.percentBasisPoints,
    duration: promotion.duration,
    durationInMonths: promotion.durationInMonths,
    currentTier,
  };
}

function getCurrentTier(): PlanTier {
  return "free";
}

export const getPromotionByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<PublicPromotion | null> => {
    const codeNormalized = normalizePromotionCode(args.code);
    const promotion = await ctx.db
      .query("promotions")
      .withIndex("by_codeNormalized", (q) =>
        q.eq("codeNormalized", codeNormalized),
      )
      .unique();
    if (!promotion) {
      return null;
    }

    const redemptions = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_promotion_user", (q) =>
        q.eq("promotionId", promotion.promotionId).eq("userId", ctx.userId),
      )
      .order("desc")
      .collect();
    const currentTier = getCurrentTier();

    return publicPromotionShape(promotion, redemptions, currentTier);
  },
});

export const redeemGiftedCreditsPromotion = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const codeNormalized = normalizePromotionCode(args.code);
    const promotion = await ctx.db
      .query("promotions")
      .withIndex("by_codeNormalized", (q) =>
        q.eq("codeNormalized", codeNormalized),
      )
      .unique();
    if (promotion?.type !== "gifted_credits") {
      throw new ConvexError("Promotion not found.");
    }
    const availability = getPromotionAvailability(promotion);
    if (!availability.isRedeemable) {
      throw new ConvexError(`Promotion is ${availability.blockedReason}.`);
    }

    const existing = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_promotion_user", (q) =>
        q.eq("promotionId", promotion.promotionId).eq("userId", ctx.userId),
      )
      .first();
    if ((promotion.singleUsePerUser ?? true) && existing) {
      return {
        status: "already_redeemed" as const,
        redemptionId: existing.redemptionId,
      };
    }

    const amount = promotion.creditAmount;
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      throw new ConvexError("Promotion is missing its credit amount.");
    }
    const now = Date.now();
    const redemptionId = crypto.randomUUID();
    const grant = await grantCreditsTx(ctx, {
      userId: ctx.userId,
      bucket: "gifted",
      amount,
      source: "promotion",
      sourceId:
        promotion.singleUsePerUser === false
          ? `promotion:${promotion.promotionId}:user:${ctx.userId}:redemption:${redemptionId}`
          : `promotion:${promotion.promotionId}:user:${ctx.userId}`,
      expiresAt: getGiftedCreditExpiresAt(promotion.creditExpiryPolicy),
      metadata: {
        promotionId: promotion.promotionId,
        code: promotion.code,
      },
    });
    await ctx.db.insert("promotionRedemptions", {
      redemptionId,
      promotionId: promotion.promotionId,
      codeNormalized,
      userId: ctx.userId,
      type: "gifted_credits",
      status: "applied",
      creditGrantId: grant.grantId,
      createdAt: now,
      updatedAt: now,
      confirmedAt: now,
      metadata: { amount },
    });
    await ctx.db.patch(promotion._id, {
      redemptionCount: promotion.redemptionCount + 1,
      updatedAt: now,
    });

    return {
      status: "applied" as const,
      redemptionId,
      grantId: grant.grantId,
      amount,
    };
  },
});

function getGiftedCreditExpiresAt(policy: PromotionDoc["creditExpiryPolicy"]) {
  if (!policy || policy.type === "none") {
    return undefined;
  }
  if (policy.type === "absolute") {
    return policy.expiresAt;
  }
  return Date.now() + policy.days * 86_400_000;
}

export const createPromotionSubscriptionCheckout = action({
  args: { code: v.string(), tier: subscriptionPromotionTierValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; redemptionId: string }> => {
    const promotionForAccess = await ctx.runQuery(
      internal.functions.promotions.internal_getPromotionByNormalizedCode,
      { codeNormalized: normalizePromotionCode(args.code) },
    );
    const currentBilling = (await ctx.runQuery(
      api.functions.billing.getCurrentBillingState,
      {},
    )) as { tier?: PlanTier };
    if (
      currentBilling.tier &&
      currentBilling.tier !== "free" &&
      promotionForAccess?.newPaidSubscriptionsOnly !== false
    ) {
      throw new Error(
        "Subscription promotions are for new paid subscriptions.",
      );
    }

    const prepared = (await ctx.runMutation(
      internal.functions.promotions
        .internal_prepareSubscriptionCheckoutRedemption,
      { code: args.code, tier: args.tier, userId: ctx.userId },
    )) as {
      promotionId: string;
      redemptionId: string;
      code: string;
      codeNormalized: string;
      polarDiscountId: string;
      productId: string;
      targetTier: SubscriptionPromotionTier;
      newPaidSubscriptionsOnly: boolean;
    };

    const customerId = await ensurePolarCustomerForCurrentUser(ctx);
    const env = backendEnv();
    const siteUrl = env.SITE_URL.replace(/\/+$/, "");
    const polarSdk = getPolarSdkClient();

    try {
      const checkout = await withTimeout(
        polarSdk.checkouts.create({
          products: [prepared.productId],
          customerId,
          externalCustomerId: ctx.userId,
          discountId: prepared.polarDiscountId,
          allowDiscountCodes: false,
          successUrl: `${siteUrl}/settings?promo=${encodeURIComponent(prepared.code)}&checkout_id={CHECKOUT_ID}`,
          returnUrl: `${siteUrl}/promo/${encodeURIComponent(prepared.code)}`,
          metadata: {
            kind: "subscription_promotion",
            promotionId: prepared.promotionId,
            redemptionId: prepared.redemptionId,
            code: prepared.code,
            targetTier: prepared.targetTier,
            userId: ctx.userId,
          },
        }),
        POLAR_NETWORK_TIMEOUT_MS,
        "polar.checkouts.create",
      );

      const checkoutId =
        typeof checkout.id === "string" ? checkout.id : undefined;
      const checkoutUrl =
        typeof checkout.url === "string" ? checkout.url : undefined;
      if (!checkoutId || !checkoutUrl) {
        throw new Error("Polar did not return a checkout URL.");
      }
      await ctx.runMutation(
        internal.functions.promotions.internal_markSubscriptionCheckoutCreated,
        {
          redemptionId: prepared.redemptionId,
          userId: ctx.userId,
          polarCheckoutId: checkoutId,
        },
      );
      return { url: checkoutUrl, redemptionId: prepared.redemptionId };
    } catch (error) {
      await ctx.runMutation(
        internal.functions.promotions.internal_markPromotionRedemptionFailed,
        {
          redemptionId: prepared.redemptionId,
          userId: ctx.userId,
          reason: getErrorText(error),
        },
      );
      throw new Error(
        `Could not create discounted checkout (${getErrorText(error)}).`,
      );
    }
  },
});

export const adminCreatePromotion = adminAction({
  args: promotionConfigValidator,
  handler: async (ctx, args): Promise<{ promotionId: string }> => {
    const codeNormalized = validatePromotionConfig(args);
    const existing = await ctx.runQuery(
      internal.functions.promotions.internal_getPromotionByNormalizedCode,
      { codeNormalized },
    );
    if (existing) {
      throw new Error("A promotion with that code already exists.");
    }

    let polarDiscountId: string | undefined;
    let polarDiscountCode: string | undefined;
    let polarSyncError: string | undefined;
    if (args.type === "subscription_discount") {
      try {
        const polarCode = polarCompatibleDiscountCode(codeNormalized);
        const discount = await createPolarDiscount(args, polarCode);
        polarDiscountId = pickString((discount as Record<string, unknown>).id);
        polarDiscountCode =
          pickString((discount as Record<string, unknown>).code) ??
          codeNormalized;
        if (!polarDiscountId) {
          throw new Error("Polar did not return a discount id.");
        }
      } catch (error) {
        polarSyncError = getErrorText(error);
        throw new Error(`Could not create Polar discount (${polarSyncError}).`);
      }
    }

    return await ctx.runMutation(
      internal.functions.promotions.internal_createPromotionRecord,
      {
        ...args,
        codeNormalized,
        status: args.status ?? "active",
        createdByUserId: ctx.userId,
        polarDiscountId,
        polarDiscountCode,
        polarSyncedAt: polarDiscountId ? Date.now() : undefined,
        polarSyncError,
      },
    );
  },
});

export const adminUpdatePromotion = adminAction({
  args: {
    promotionId: v.string(),
    patch: v.object(promotionConfigValidator),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; locked: boolean }> => {
    const promotion = await ctx.runQuery(
      internal.functions.promotions.internal_getPromotionByPromotionId,
      { promotionId: args.promotionId },
    );
    if (!promotion) {
      throw new Error("Promotion not found.");
    }
    const incoming = args.patch;
    validatePromotionUpdateInput(promotion, incoming);
    const locked = promotion.redemptionCount > 0;

    if (
      promotion.type === "subscription_discount" &&
      promotion.polarDiscountId
    ) {
      await updatePolarDiscount(promotion.polarDiscountId, incoming, locked);
    }

    return await ctx.runMutation(
      internal.functions.promotions.internal_updatePromotionRecord,
      args,
    );
  },
});

export const internal_updatePromotionRecord = internalMutation({
  args: {
    promotionId: v.string(),
    patch: v.object(promotionConfigValidator),
  },
  handler: async (ctx, args) => {
    const promotion = await getPromotionById(ctx, args.promotionId);
    if (!promotion) {
      throw new ConvexError("Promotion not found.");
    }
    const incoming = args.patch;
    validatePromotionUpdateInput(promotion, incoming);

    const now = Date.now();
    const locked = promotion.redemptionCount > 0;
    const commonPatch = {
      name: incoming.name.trim(),
      description: cleanOptionalString(incoming.description),
      status: incoming.status ?? promotion.status,
      startsAt: incoming.startsAt,
      endsAt: incoming.endsAt,
      maxRedemptions: incoming.maxRedemptions,
      singleUsePerUser: incoming.singleUsePerUser ?? true,
      newPaidSubscriptionsOnly:
        incoming.type === "subscription_discount"
          ? (incoming.newPaidSubscriptionsOnly ?? true)
          : undefined,
      updatedAt: now,
    };

    if (locked) {
      await ctx.db.patch(promotion._id, commonPatch);
      return { ok: true, locked: true };
    }

    await ctx.db.patch(promotion._id, {
      ...commonPatch,
      creditAmount:
        incoming.type === "gifted_credits" ? incoming.creditAmount : undefined,
      creditExpiryPolicy:
        incoming.type === "gifted_credits"
          ? (incoming.creditExpiryPolicy ?? { type: "none" as const })
          : undefined,
      eligibleTiers:
        incoming.type === "subscription_discount"
          ? (incoming.eligibleTiers ?? ["plus", "pro"])
          : undefined,
      discountType:
        incoming.type === "subscription_discount"
          ? incoming.discountType
          : undefined,
      amountCents:
        incoming.type === "subscription_discount" &&
        incoming.discountType === "fixed"
          ? incoming.amountCents
          : undefined,
      percentBasisPoints:
        incoming.type === "subscription_discount" &&
        incoming.discountType === "percentage"
          ? incoming.percentBasisPoints
          : undefined,
      currency: incoming.type === "subscription_discount" ? "usd" : undefined,
      duration:
        incoming.type === "subscription_discount"
          ? (incoming.duration ?? "once")
          : undefined,
      durationInMonths:
        incoming.type === "subscription_discount" &&
        incoming.duration === "repeating"
          ? incoming.durationInMonths
          : undefined,
    });
    return { ok: true, locked: false };
  },
});

export const adminArchivePromotion = adminMutation({
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    const promotion = await getPromotionById(ctx, args.promotionId);
    if (!promotion) {
      throw new ConvexError("Promotion not found.");
    }
    const now = Date.now();
    await ctx.db.patch(promotion._id, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const adminListPromotions = adminQuery({
  args: {
    search: v.optional(v.string()),
    type: v.optional(promotionTypeValidator),
    status: v.optional(promotionStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const filterType = args.type;
    const filterStatus = args.status;
    const base =
      filterType !== undefined && filterStatus !== undefined
        ? ctx.db
            .query("promotions")
            .withIndex("by_type_status_createdAt", (q) =>
              q.eq("type", filterType).eq("status", filterStatus),
            )
        : filterStatus !== undefined
          ? ctx.db
              .query("promotions")
              .withIndex("by_status_createdAt", (q) =>
                q.eq("status", filterStatus),
              )
          : ctx.db.query("promotions");
    const result = await base.order("desc").paginate(args.paginationOpts);
    const search = args.search?.trim().toLowerCase();
    const page = search
      ? result.page.filter(
          (promo) =>
            promo.code.toLowerCase().includes(search) ||
            promo.name.toLowerCase().includes(search),
        )
      : result.page;
    return { ...result, page };
  },
});

export const adminGetPromotion = adminQuery({
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    return await getPromotionById(ctx, args.promotionId);
  },
});

export const adminListPromotionRedemptions = adminQuery({
  args: {
    promotionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_promotion_status", (q) =>
        q.eq("promotionId", args.promotionId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const userCache = new Map<
      string,
      { email?: string; name?: string } | null
    >();
    const page = await Promise.all(
      result.page.map(async (redemption) => {
        let user = userCache.get(redemption.userId);
        if (user === undefined) {
          const authUser = await authComponent.getAnyUserById(
            ctx,
            redemption.userId,
          );
          user = authUser
            ? {
                email:
                  typeof authUser.email === "string"
                    ? authUser.email
                    : undefined,
                name:
                  typeof authUser.name === "string" ? authUser.name : undefined,
              }
            : null;
          userCache.set(redemption.userId, user);
        }

        return {
          ...redemption,
          user: user ?? undefined,
        };
      }),
    );

    return { ...result, page };
  },
});

export const internal_getPromotionByNormalizedCode = internalQuery({
  args: { codeNormalized: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("promotions")
      .withIndex("by_codeNormalized", (q) =>
        q.eq("codeNormalized", args.codeNormalized),
      )
      .unique();
  },
});

export const internal_getPromotionByPromotionId = internalQuery({
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    return await getPromotionById(ctx, args.promotionId);
  },
});

export const internal_createPromotionRecord = internalMutation({
  args: {
    ...promotionConfigValidator,
    codeNormalized: v.string(),
    status: promotionStatusValidator,
    createdByUserId: v.string(),
    polarDiscountId: v.optional(v.string()),
    polarDiscountCode: v.optional(v.string()),
    polarSyncedAt: v.optional(v.number()),
    polarSyncError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const promotionId = crypto.randomUUID();
    await ctx.db.insert("promotions", {
      promotionId,
      code: args.codeNormalized,
      codeNormalized: args.codeNormalized,
      name: args.name.trim(),
      description: cleanOptionalString(args.description),
      type: args.type,
      status: args.status,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      maxRedemptions: args.maxRedemptions,
      singleUsePerUser: args.singleUsePerUser ?? true,
      newPaidSubscriptionsOnly:
        args.type === "subscription_discount"
          ? (args.newPaidSubscriptionsOnly ?? true)
          : undefined,
      redemptionCount: 0,
      createdByUserId: args.createdByUserId,
      createdAt: now,
      updatedAt: now,
      creditAmount:
        args.type === "gifted_credits" ? args.creditAmount : undefined,
      creditExpiryPolicy:
        args.type === "gifted_credits"
          ? (args.creditExpiryPolicy ?? { type: "none" as const })
          : undefined,
      eligibleTiers:
        args.type === "subscription_discount"
          ? (args.eligibleTiers ?? ["plus", "pro"])
          : undefined,
      discountType:
        args.type === "subscription_discount" ? args.discountType : undefined,
      amountCents:
        args.type === "subscription_discount" && args.discountType === "fixed"
          ? args.amountCents
          : undefined,
      percentBasisPoints:
        args.type === "subscription_discount" &&
        args.discountType === "percentage"
          ? args.percentBasisPoints
          : undefined,
      currency: args.type === "subscription_discount" ? "usd" : undefined,
      duration:
        args.type === "subscription_discount"
          ? (args.duration ?? "once")
          : undefined,
      durationInMonths:
        args.type === "subscription_discount" && args.duration === "repeating"
          ? args.durationInMonths
          : undefined,
      polarDiscountId: args.polarDiscountId,
      polarDiscountCode: args.polarDiscountCode,
      polarSyncedAt: args.polarSyncedAt,
      polarSyncError: args.polarSyncError,
    });
    return { promotionId };
  },
});

export const internal_prepareSubscriptionCheckoutRedemption = internalMutation({
  args: {
    code: v.string(),
    tier: subscriptionPromotionTierValidator,
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const codeNormalized = normalizePromotionCode(args.code);
    const promotion = await ctx.db
      .query("promotions")
      .withIndex("by_codeNormalized", (q) =>
        q.eq("codeNormalized", codeNormalized),
      )
      .unique();
    if (promotion?.type !== "subscription_discount") {
      throw new ConvexError("Promotion not found.");
    }
    const availability = getPromotionAvailability(promotion);
    if (!availability.isRedeemable) {
      throw new ConvexError(`Promotion is ${availability.blockedReason}.`);
    }
    const eligibleTiers = promotion.eligibleTiers ?? ["plus", "pro"];
    if (!eligibleTiers.includes(args.tier)) {
      throw new ConvexError("This promotion is not valid for that plan.");
    }
    if (!promotion.polarDiscountId) {
      throw new ConvexError("Promotion is missing its Polar discount.");
    }

    const userRedemptions = await ctx.db
      .query("promotionRedemptions")
      .withIndex("by_promotion_user", (q) =>
        q.eq("promotionId", promotion.promotionId).eq("userId", args.userId),
      )
      .collect();
    if (
      (promotion.singleUsePerUser ?? true) &&
      userRedemptions.some((r) => r.status === "confirmed")
    ) {
      throw new ConvexError("You have already redeemed this promotion.");
    }

    const productId = productIdForTier(args.tier);
    const now = Date.now();
    const redemptionId = crypto.randomUUID();
    await ctx.db.insert("promotionRedemptions", {
      redemptionId,
      promotionId: promotion.promotionId,
      codeNormalized,
      userId: args.userId,
      type: "subscription_discount",
      status: "checkout_created",
      targetTier: args.tier,
      targetProductId: productId,
      createdAt: now,
      updatedAt: now,
    });
    return {
      promotionId: promotion.promotionId,
      redemptionId,
      code: promotion.code,
      codeNormalized,
      polarDiscountId: promotion.polarDiscountId,
      productId,
      targetTier: args.tier,
      newPaidSubscriptionsOnly: promotion.newPaidSubscriptionsOnly ?? true,
    };
  },
});

export const internal_markSubscriptionCheckoutCreated = internalMutation({
  args: {
    redemptionId: v.string(),
    userId: v.string(),
    polarCheckoutId: v.string(),
  },
  handler: async (ctx, args) => {
    const redemption = await getRedemptionById(ctx, args.redemptionId);
    if (redemption?.userId !== args.userId) {
      throw new ConvexError("Promotion redemption not found.");
    }
    await ctx.db.patch(redemption._id, {
      polarCheckoutId: args.polarCheckoutId,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const internal_markPromotionRedemptionFailed = internalMutation({
  args: {
    redemptionId: v.string(),
    userId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const redemption = await getRedemptionById(ctx, args.redemptionId);
    if (
      redemption?.userId !== args.userId ||
      redemption.status === "confirmed"
    ) {
      return { ok: true };
    }
    await ctx.db.patch(redemption._id, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: { reason: args.reason },
    });
    return { ok: true };
  },
});

export const internal_confirmSubscriptionPromotionRedemption = internalMutation(
  {
    args: {
      redemptionId: v.optional(v.string()),
      promotionId: v.optional(v.string()),
      userId: v.string(),
      polarCheckoutId: v.optional(v.string()),
      polarOrderId: v.optional(v.string()),
      polarSubscriptionId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      let redemption: PromotionRedemptionDoc | null = null;
      if (args.redemptionId) {
        redemption = await getRedemptionById(ctx, args.redemptionId);
      }
      if (redemption === null && args.polarCheckoutId) {
        redemption = await ctx.db
          .query("promotionRedemptions")
          .withIndex("by_checkoutId", (q) =>
            q.eq("polarCheckoutId", args.polarCheckoutId),
          )
          .first();
      }
      if (redemption?.userId !== args.userId) {
        throw new ConvexError("Promotion redemption not found.");
      }
      if (args.promotionId && redemption.promotionId !== args.promotionId) {
        throw new ConvexError("Promotion mismatch.");
      }

      const promotion = await getPromotionById(ctx, redemption.promotionId);
      if (!promotion) {
        throw new ConvexError("Promotion not found.");
      }
      if (redemption.status === "confirmed") {
        return { ok: true, alreadyConfirmed: true };
      }

      const now = Date.now();
      await ctx.db.patch(redemption._id, {
        status: "confirmed",
        polarCheckoutId: args.polarCheckoutId ?? redemption.polarCheckoutId,
        polarOrderId: args.polarOrderId ?? redemption.polarOrderId,
        polarSubscriptionId:
          args.polarSubscriptionId ?? redemption.polarSubscriptionId,
        confirmedAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(promotion._id, {
        redemptionCount: promotion.redemptionCount + 1,
        updatedAt: now,
      });
      return { ok: true, alreadyConfirmed: false };
    },
  },
);

function productIdForTier(tier: SubscriptionPromotionTier) {
  const productId =
    tier === "plus"
      ? // eslint-disable-next-line turbo/no-undeclared-env-vars, no-restricted-properties
        process.env.POLAR_PLUS_PRODUCT_ID
      : // eslint-disable-next-line turbo/no-undeclared-env-vars, no-restricted-properties
        process.env.POLAR_PRO_PRODUCT_ID;
  if (!productId) {
    throw new ConvexError(`POLAR_${tier.toUpperCase()}_PRODUCT_ID is not set.`);
  }
  return productId;
}

function polarCompatibleDiscountCode(codeNormalized: string) {
  const code = codeNormalized.replace(/[^A-Z0-9]/g, "");
  return code.length >= 3 ? code : undefined;
}

async function createPolarDiscount(
  args: PromotionConfigInput,
  polarCode: string | undefined,
) {
  const polarSdk = getPolarSdkClient();
  const duration = args.duration ?? "once";
  const payload: Record<string, unknown> = {
    name: args.name.trim(),
    code: polarCode,
    duration,
    type: args.discountType,
    startsAt: args.startsAt ? new Date(args.startsAt) : undefined,
    endsAt: args.endsAt ? new Date(args.endsAt) : undefined,
    maxRedemptions: args.maxRedemptions,
    metadata: {
      source: "redux_chat_promotion",
      code: normalizePromotionCode(args.code),
      eligibleTiers: (args.eligibleTiers ?? ["plus", "pro"]).join(","),
    },
  };
  if (duration === "repeating") {
    payload.durationInMonths = args.durationInMonths;
  }
  if (args.discountType === "fixed") {
    payload.amount = args.amountCents;
    payload.currency = "usd";
  } else {
    payload.basisPoints = args.percentBasisPoints;
  }

  return await withTimeout(
    polarSdk.discounts.create(payload as never),
    POLAR_NETWORK_TIMEOUT_MS,
    "polar.discounts.create",
  );
}

async function updatePolarDiscount(
  discountId: string,
  args: PromotionConfigInput,
  locked: boolean,
) {
  const polarSdk = getPolarSdkClient();
  const payload = buildPolarDiscountUpdatePayload(args, locked);
  await withTimeout(
    polarSdk.discounts.update({
      id: discountId,
      discountUpdate: payload,
    }),
    POLAR_NETWORK_TIMEOUT_MS,
    "polar.discounts.update",
  );
}

function buildPolarDiscountUpdatePayload(
  args: PromotionConfigInput,
  locked: boolean,
) {
  const duration = args.duration ?? "once";
  const payload: Record<string, unknown> = {
    name: args.name.trim(),
    startsAt: args.startsAt ? new Date(args.startsAt) : null,
    endsAt: args.endsAt ? new Date(args.endsAt) : null,
    maxRedemptions: args.maxRedemptions ?? null,
    metadata: {
      source: "redux_chat_promotion",
      code: normalizePromotionCode(args.code),
      eligibleTiers: (args.eligibleTiers ?? ["plus", "pro"]).join(","),
    },
  };

  if (!locked) {
    payload.duration = duration;
    payload.durationInMonths =
      duration === "repeating" ? args.durationInMonths : null;
    payload.type = args.discountType;
    if (args.discountType === "fixed") {
      payload.amount = args.amountCents;
      payload.currency = "usd";
      payload.basisPoints = null;
    } else {
      payload.amount = null;
      payload.currency = null;
      payload.basisPoints = args.percentBasisPoints;
    }
  }

  return payload;
}

async function ensurePolarCustomerForCurrentUser(ctx: {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runQuery: (fn: any, args: Record<string, never>) => Promise<unknown>;
}) {
  const polarSdk = getPolarSdkClient();
  try {
    const customer = await polarSdk.customers.getExternal({
      externalId: ctx.userId,
    });
    if (typeof customer.id === "string") {
      return customer.id;
    }
  } catch (error) {
    if (!isPolarNotFoundError(error)) {
      throw error;
    }
  }

  const user = (await ctx.runQuery(
    api.functions.user.getCurrentUserPolarInfo,
    {},
  )) as {
    email: string;
    userId: string;
  };
  const customer = await polarSdk.customers.create({
    email: user.email,
    externalId: user.userId,
    metadata: { userId: user.userId },
  });
  return customer.id;
}

function isPolarNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    statusCode?: number;
    response?: { status?: number };
    message?: string;
  };
  return (
    candidate.statusCode === 404 ||
    candidate.response?.status === 404 ||
    (typeof candidate.message === "string" &&
      candidate.message.toLowerCase().includes("not found"))
  );
}

type DbCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

async function getPromotionById(
  ctx: DbCtx,
  promotionId: string,
): Promise<PromotionDoc | null> {
  return await ctx.db
    .query("promotions")
    .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
    .unique();
}

async function getRedemptionById(
  ctx: DbCtx,
  redemptionId: string,
): Promise<PromotionRedemptionDoc | null> {
  return await ctx.db
    .query("promotionRedemptions")
    .withIndex("by_redemptionId", (q) => q.eq("redemptionId", redemptionId))
    .unique();
}

function cleanOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getErrorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

void internal;
