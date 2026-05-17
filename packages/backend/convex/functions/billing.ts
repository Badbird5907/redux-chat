import type { GenericActionCtx, GenericQueryCtx } from "convex/server";
import type Stripe from "stripe";
import { v } from "convex/values";

import type { PlanTier } from "@redux/shared";
import {
  calculatePurchasedCreditsFromCents,
  calculateUsageCharge,
  getPlanConfig,
  MAX_CREDIT_TOP_UP_USD_CENTS,
  MIN_CREDIT_TOP_UP_USD_CENTS,
} from "@redux/shared";

import type { DataModel } from "../_generated/dataModel";
import type { BillingSubscriptionSchedule } from "../billing";
import { api, components, internal } from "../_generated/api";
import {
  billingDebugWarn,
  getBillingConfig,
  getBillingPeriodKey,
  getUtcMonthBounds,
  isPaidSubscriptionStatus,
  resolveTierFromSubscription,
  stripeLiveSubscriptionPriceId,
  subscriptionScheduleFromStripeSubscription,
  toSubscriptionSnapshot,
} from "../billing";
import { getCreditBalanceForUser } from "../credits";
import { backendEnv } from "../env";
import {
  getStripePlanPrices,
  getStripeSdkClient,
  isConfiguredStripePlanPrice,
  stripeComponent,
  tierFromStripePriceId,
} from "../stripe";
import { action, query } from "./index";
import { internalMutation, internalQuery } from "./internal";

function planTierRank(tier: PlanTier): number {
  if (tier === "free") return 0;
  if (tier === "plus") return 1;
  return 2;
}

type BillingActionCtx = GenericActionCtx<DataModel> & {
  userId: string;
};

type BillingSubscriptionState = {
  tier: PlanTier;
  subscription: ReturnType<typeof toSubscriptionSnapshot>;
};

type BillingRefreshResult = {
  tier: PlanTier;
  availableCredits: number | undefined;
  overageCredits: number | undefined;
  spendableCredits: number;
  bucketBalances: {
    gifted: number;
    monthly: number;
    paid: number;
  };
  expiringSoon: {
    bucket: "gifted" | "monthly" | "paid";
    grantId: string;
    remaining: number;
    expiresAt: number;
  }[];
  overageAllowed: boolean;
  grantApplied: boolean;
  periodKey: string;
  subscriptionSchedule: BillingSubscriptionSchedule;
};

type StripeCustomerBalanceCredit = {
  amount: number;
  currency: string;
};

type PaidPlanSwitchPreviewLine = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  periodStart: number | undefined;
  periodEnd: number | undefined;
};

type PaidPlanSwitchPreview = {
  prorationDate: number;
  currency: string;
  subtotal: number;
  total: number;
  amountDue: number;
  startingBalance: number;
  prorationSubtotal: number;
  prorationCredit: number;
  prorationCharge: number;
  otherInvoiceAmount: number;
  lines: PaidPlanSwitchPreviewLine[];
};

type CreditTopUpIntent = {
  intentId: string;
  userId: string;
  amountCents: number;
  currency: "usd";
  credits: number;
  status: "created" | "checkout_created" | "paid" | "expired" | "failed";
  stripeCheckoutSessionId: string | undefined;
  stripePaymentIntentId: string | undefined;
  createdAt: number;
  updatedAt: number;
};

const usageValidator = v.object({
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  inputAudioTokens: v.optional(v.number()),
  outputAudioTokens: v.optional(v.number()),
});

const toolCallValidator = v.object({
  billingKey: v.string(),
  invocationCount: v.number(),
});

const STRIPE_NETWORK_TIMEOUT_MS = 10_000;

export const getConfiguredStripePrices = query({
  args: {},
  handler: () => {
    const prices = getStripePlanPrices();
    return {
      plus: { id: prices.plus, amount: undefined, currency: "USD" },
      pro: { id: prices.pro, amount: undefined, currency: "USD" },
    };
  },
});

export const getConfiguredStripePriceDetails = action({
  args: {},
  handler: async (): Promise<{
    plus: { id: string; amount: number | null; currency: string | null };
    pro: { id: string; amount: number | null; currency: string | null };
  }> => {
    const prices = getStripePlanPrices();
    const stripe = getStripeSdkClient();
    const [plus, pro] = await Promise.all([
      stripe.prices.retrieve(prices.plus),
      stripe.prices.retrieve(prices.pro),
    ]);

    return {
      plus: {
        id: prices.plus,
        amount: plus.unit_amount,
        currency: plus.currency.toUpperCase(),
      },
      pro: {
        id: prices.pro,
        amount: pro.unit_amount,
        currency: pro.currency.toUpperCase(),
      },
    };
  },
});

export const getCurrentUserStripeCustomerBalance = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    balanceCount: number;
    balances: StripeCustomerBalanceCredit[];
  }> => {
    const customerId = await ensureStripeCustomerForCurrentUser(ctx);
    const stripe = getStripeSdkClient();
    const customer = await stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) {
      return { balanceCount: 0, balances: [] };
    }

    const balancesByCurrency = new Map<string, number>();
    const invoiceCreditBalance = customer.invoice_credit_balance;
    if (invoiceCreditBalance) {
      for (const [currency, balance] of Object.entries(invoiceCreditBalance)) {
        if (balance < 0) {
          balancesByCurrency.set(currency.toUpperCase(), Math.abs(balance));
        }
      }
    }
    if (balancesByCurrency.size === 0 && customer.balance < 0) {
      balancesByCurrency.set(
        (customer.currency ?? "usd").toUpperCase(),
        Math.abs(customer.balance),
      );
    }

    const balances = [...balancesByCurrency.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    return {
      balanceCount: balances.length,
      balances,
    };
  },
});

export const getCurrentBillingState = query({
  args: {},
  handler: async (ctx) => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());
    const freePeriodBounds =
      subscriptionState.tier === "free" ? getUtcMonthBounds() : undefined;

    const balance = await getCreditBalanceForUser(ctx, ctx.userId);
    const availableCredits = balance.spendableCredits;
    const overageCredits = 0;

    return {
      tier: subscriptionState.tier,
      subscription: subscriptionState.subscription,
      availableCredits,
      overageCredits,
      spendableCredits: balance.spendableCredits,
      bucketBalances: balance.bucketBalances,
      expiringSoon: balance.expiringSoon,
      markupMultiplier: plan.markupMultiplier,
      includedMonthlyCredits: plan.includedMonthlyCredits,
      overageAllowed: plan.overageAllowed,
      currentPeriodStart:
        subscriptionState.subscription?.currentPeriodStart ??
        freePeriodBounds?.start,
      currentPeriodEnd:
        subscriptionState.subscription?.currentPeriodEnd ??
        freePeriodBounds?.end,
      syncedAt: undefined,
    };
  },
});

export const createCurrentUserSubscriptionCheckout = action({
  args: { priceId: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    if (!isConfiguredStripePlanPrice(args.priceId)) {
      throw new Error("That price is not a configured plan.");
    }

    const targetTier = tierFromStripePriceId(args.priceId);
    const subscriptionState = await resolveCurrentSubscriptionStateWithFallback(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier !== "free") {
      throw new Error(
        "You already have a paid subscription. Use plan switching or Manage billing instead.",
      );
    }

    const env = backendEnv();
    const siteUrl = env.SITE_URL.replace(/\/+$/, "");
    const customerId = await ensureStripeCustomerForCurrentUser(ctx);
    const session = await stripeComponent.createCheckoutSession(ctx, {
      priceId: args.priceId,
      customerId,
      mode: "subscription",
      successUrl: `${siteUrl}/settings?checkout=success`,
      cancelUrl: `${siteUrl}/settings`,
      metadata: {
        userId: ctx.userId,
        priceId: args.priceId,
        tier: targetTier,
      },
      subscriptionMetadata: {
        userId: ctx.userId,
        priceId: args.priceId,
        tier: targetTier,
      },
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    return { url: session.url };
  },
});

export const createCurrentUserCustomerPortal = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const env = backendEnv();
    const siteUrl = env.SITE_URL.replace(/\/+$/, "");
    const customerId = await ensureStripeCustomerForCurrentUser(ctx);
    return await stripeComponent.createCustomerPortalSession(ctx, {
      customerId,
      returnUrl: `${siteUrl}/settings`,
    });
  },
});

export const createCurrentUserCreditTopUpCheckout = action({
  args: { amountCents: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
    intentId: string;
    amountCents: number;
    credits: number;
  }> => {
    const amountCents = args.amountCents;
    if (!Number.isInteger(amountCents)) {
      throw new Error("Enter an amount in whole cents.");
    }
    if (amountCents < MIN_CREDIT_TOP_UP_USD_CENTS) {
      throw new Error("Credit top-ups have a $5.00 minimum.");
    }
    if (amountCents > MAX_CREDIT_TOP_UP_USD_CENTS) {
      throw new Error("Credit top-ups are limited to $500.00 per checkout.");
    }

    const subscriptionState = await resolveCurrentSubscriptionStateWithFallback(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error("Credit top-ups are available on paid plans.");
    }

    const env = backendEnv();
    if (!env.STRIPE_CREDIT_TOP_UP_PRODUCT_ID) {
      throw new Error("STRIPE_CREDIT_TOP_UP_PRODUCT_ID is not set.");
    }
    const credits = calculatePurchasedCreditsFromCents(
      amountCents,
      getBillingConfig(),
    );
    const customerId = await ensureStripeCustomerForCurrentUser(ctx);
    const intent = await ctx.runMutation(
      internal.functions.billing.internal_createCreditTopUpIntent,
      {
        userId: ctx.userId,
        amountCents,
        credits,
      },
    );

    const siteUrl = env.SITE_URL.replace(/\/+$/, "");
    const stripe = getStripeSdkClient();
    const metadata = {
      kind: "credit_top_up",
      intentId: intent.intentId,
      userId: ctx.userId,
      amountCents: String(amountCents),
      credits: String(credits),
    };

    try {
      const checkout = await withTimeout(
        stripe.checkout.sessions.create({
          mode: "payment",
          customer: customerId,
          client_reference_id: ctx.userId,
          line_items: [
            {
              price_data: {
                currency: "usd",
                product: env.STRIPE_CREDIT_TOP_UP_PRODUCT_ID,
                unit_amount: amountCents,
              },
              quantity: 1,
            },
          ],
          success_url: `${siteUrl}/settings?creditTopUp=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/settings`,
          metadata,
          payment_intent_data: { metadata },
        }),
        STRIPE_NETWORK_TIMEOUT_MS,
        "stripe.checkout.sessions.create",
      );

      await ctx.runMutation(
        internal.functions.billing.internal_markCreditTopUpCheckoutCreated,
        {
          intentId: intent.intentId,
          userId: ctx.userId,
          stripeCheckoutSessionId: checkout.id,
        },
      );

      if (!checkout.url) {
        throw new Error("Stripe did not return a checkout URL.");
      }

      return {
        url: checkout.url,
        intentId: intent.intentId,
        amountCents,
        credits,
      };
    } catch (error) {
      await ctx.runMutation(
        internal.functions.billing.internal_markCreditTopUpIntentFailed,
        {
          intentId: intent.intentId,
          userId: ctx.userId,
        },
      );
      throw new Error(
        `Could not create credit checkout (${getErrorText(error)}). Try again.`,
      );
    }
  },
});

export const previewGenerationCharge = query({
  args: {
    routeId: v.string(),
    usage: usageValidator,
    toolCalls: v.optional(v.array(toolCallValidator)),
  },
  handler: async (ctx, args) => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );

    return calculateUsageCharge(
      {
        routeId: args.routeId,
        usage: args.usage,
        toolCalls: args.toolCalls,
        tier: subscriptionState.tier,
      },
      getBillingConfig(),
    );
  },
});

export const refreshCurrentUserBillingState = action({
  args: {},
  handler: async (ctx): Promise<BillingRefreshResult> => {
    return await refreshBillingStateForUser(ctx, ctx.userId);
  },
});

export const previewCurrentUserPaidPlanSwitch = action({
  args: { priceId: v.string() },
  handler: async (ctx, args): Promise<PaidPlanSwitchPreview> => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error("Use checkout to subscribe from the free plan.");
    }

    let targetTier: PlanTier;
    try {
      targetTier = tierFromStripePriceId(args.priceId);
    } catch {
      throw new Error("That price is not a configured plan.");
    }

    if (planTierRank(targetTier) <= planTierRank(subscriptionState.tier)) {
      throw new Error("Immediate invoice previews are only used for upgrades.");
    }

    const subscription = subscriptionState.subscription;
    if (!subscription?.subscriptionId) {
      throw new Error("No subscription found to preview.");
    }
    if (subscription.priceId === args.priceId) {
      throw new Error("You are already on this plan.");
    }

    const stripe = getStripeSdkClient();
    const liveSub = await withTimeout(
      stripe.subscriptions.retrieve(subscription.subscriptionId),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.subscriptions.retrieve",
    );
    const item = liveSub.items.data[0];
    if (!item) {
      throw new Error("Subscription has no billable item.");
    }
    if (item.price.id === args.priceId) {
      throw new Error(
        "Stripe already has you on this plan. Refresh billing and try again.",
      );
    }
    const customerId =
      typeof liveSub.customer === "string"
        ? liveSub.customer
        : liveSub.customer.id;
    const prorationDate = Math.floor(Date.now() / 1000);

    const invoice = await withTimeout(
      stripe.invoices.createPreview({
        customer: customerId,
        subscription: liveSub.id,
        subscription_details: {
          items: [{ id: item.id, price: args.priceId }],
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },
      }),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.invoices.createPreview",
    );

    const prorationLines = invoice.lines.data.filter(isStripeProrationLine);
    const lines = prorationLines.map((line) => ({
      id: line.id,
      description: line.description ?? "Proration",
      amount: line.amount,
      currency: line.currency.toUpperCase(),
      periodStart: line.period?.start ? line.period.start * 1000 : undefined,
      periodEnd: line.period?.end ? line.period.end * 1000 : undefined,
    }));
    const prorationSubtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const prorationCredit = lines
      .filter((line) => line.amount < 0)
      .reduce((sum, line) => sum + Math.abs(line.amount), 0);
    const prorationCharge = lines
      .filter((line) => line.amount > 0)
      .reduce((sum, line) => sum + line.amount, 0);

    return {
      prorationDate,
      currency: invoice.currency.toUpperCase(),
      subtotal: invoice.subtotal,
      total: invoice.total,
      amountDue: invoice.amount_due,
      startingBalance: invoice.starting_balance,
      prorationSubtotal,
      prorationCredit,
      prorationCharge,
      otherInvoiceAmount: invoice.total - prorationSubtotal,
      lines,
    };
  },
});

export const switchCurrentUserPaidPlan = action({
  args: { priceId: v.string(), prorationDate: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    prorationBehavior: "invoice" | "next_period";
    targetTier: PlanTier;
  }> => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error(
        "Use checkout to subscribe. Plan switches from this page are only for existing paid subscriptions.",
      );
    }

    let targetTier: PlanTier;
    try {
      targetTier = tierFromStripePriceId(args.priceId);
    } catch {
      throw new Error("That price is not a configured plan.");
    }

    const subscription = subscriptionState.subscription;
    if (!subscription?.subscriptionId) {
      throw new Error("No subscription found to update.");
    }
    if (subscription.priceId === args.priceId) {
      throw new Error("You are already on this plan.");
    }

    const fromRank = planTierRank(subscriptionState.tier);
    const toRank = planTierRank(targetTier);
    const stripe = getStripeSdkClient();
    const liveSub = await withTimeout(
      stripe.subscriptions.retrieve(subscription.subscriptionId),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.subscriptions.retrieve",
    );
    const item = liveSub.items.data[0];
    if (!item) {
      throw new Error("Subscription has no billable item.");
    }
    if (item.price.id === args.priceId) {
      throw new Error(
        "Stripe already has you on this plan. Refresh billing and try again.",
      );
    }

    if (toRank > fromRank) {
      const prorationDate = Math.floor(Date.now() / 1000);
      const updatedSubscription = await withTimeout(
        stripe.subscriptions.update(liveSub.id, {
          cancel_at_period_end: false,
          items: [{ id: item.id, price: args.priceId }],
          metadata: {
            ...liveSub.metadata,
            userId: ctx.userId,
            priceId: args.priceId,
            tier: targetTier,
            pendingPriceId: "",
            pendingAppliesAtMs: "",
          },
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        }),
        STRIPE_NETWORK_TIMEOUT_MS,
        "stripe.subscriptions.update",
      );
      await withTimeout(
        syncStripeSubscriptionToConvex(ctx, updatedSubscription),
        STRIPE_NETWORK_TIMEOUT_MS,
        "syncStripeSubscriptionToConvex",
      );
      await withTimeout(
        upsertSubscriptionMonthlyAllowance(
          ctx,
          updatedSubscription,
          targetTier,
        ),
        STRIPE_NETWORK_TIMEOUT_MS,
        "upsertSubscriptionMonthlyAllowance",
      );
      return { prorationBehavior: "invoice", targetTier };
    }

    const currentPeriodEnd = item.current_period_end;
    const currentPriceId = item.price.id;
    await createOrReplaceDowngradeSchedule(stripe, liveSub, {
      currentPriceId,
      targetPriceId: args.priceId,
      currentPeriodEnd,
      userId: ctx.userId,
      targetTier,
    });

    return { prorationBehavior: "next_period", targetTier };
  },
});

export const rescindPaidSubscriptionCancellation = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error("Only subscribers on a paid plan can use this action.");
    }
    const subscriptionId = subscriptionState.subscription?.subscriptionId;
    if (!subscriptionId) {
      throw new Error("No subscription found.");
    }

    await stripeComponent.reactivateSubscription(ctx, {
      stripeSubscriptionId: subscriptionId,
    });
    return { ok: true };
  },
});

export const discardScheduledPaidPlanChange = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error("Only subscribers on a paid plan can use this action.");
    }
    const subscriptionId = subscriptionState.subscription?.subscriptionId;
    if (!subscriptionId) {
      throw new Error("No subscription found.");
    }

    const stripe = getStripeSdkClient();
    const liveSub = await withTimeout(
      stripe.subscriptions.retrieve(subscriptionId),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.subscriptions.retrieve",
    );
    const scheduleId =
      typeof liveSub.schedule === "string"
        ? liveSub.schedule
        : liveSub.schedule?.id;
    if (scheduleId) {
      await withTimeout(
        stripe.subscriptionSchedules.release(scheduleId),
        STRIPE_NETWORK_TIMEOUT_MS,
        "stripe.subscriptionSchedules.release",
      );
    }

    await withTimeout(
      stripe.subscriptions.update(subscriptionId, {
        metadata: {
          ...liveSub.metadata,
          pendingPriceId: "",
          pendingAppliesAtMs: "",
        },
      }),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.subscriptions.update",
    );

    return { ok: true };
  },
});

export const ensureCurrentUserStripeCustomer = action({
  args: {},
  handler: async (ctx): Promise<{ customerId: string }> => {
    const customerId = await ensureStripeCustomerForCurrentUser(ctx);
    return { customerId };
  },
});

export const recordUsageEvent = action({
  args: {
    requestId: v.string(),
    messageId: v.string(),
    threadId: v.string(),
    routeId: v.string(),
    usage: usageValidator,
    toolCalls: v.optional(v.array(toolCallValidator)),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    eventId: string;
    credits: number;
    tier: PlanTier;
    debitId: string | undefined;
    overdraftAmount: number;
  }> => {
    const subscriptionState = await resolveCurrentSubscriptionStateWithFallback(
      ctx,
      ctx.userId,
    );
    const charge = calculateUsageCharge(
      {
        routeId: args.routeId,
        usage: args.usage,
        toolCalls: args.toolCalls,
        tier: subscriptionState.tier,
      },
      getBillingConfig(),
    );

    if (charge.usedPricingFallback) {
      billingDebugWarn("billing_missing_model_pricing", {
        routeId: args.routeId,
        requestId: args.requestId,
        userId: ctx.userId,
      });
    }

    const eventId = crypto.randomUUID();
    const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());
    let debitId: string | undefined;
    let overdraftAmount = 0;
    try {
      const debit = await ctx.runMutation(
        internal.functions.credits.internal_debitCredits,
        {
          userId: ctx.userId,
          requestKey: args.messageId,
          amount: charge.credits,
          overageAllowed: plan.overageAllowed,
          routeId: args.routeId,
          threadId: args.threadId,
          messageId: args.messageId,
          rawUsdCost: charge.rawUsdCost,
          effectiveUsdCost: charge.effectiveUsdCost,
          markupMultiplier: charge.markupMultiplier,
          tier: subscriptionState.tier,
          metadata: {
            requestId: args.requestId,
            usedPricingFallback: charge.usedPricingFallback,
            toolUsdCost: charge.toolUsdCost,
            modelUsdCost: charge.modelUsdCost,
          },
        },
      );
      debitId = debit.debitId;
      overdraftAmount = debit.overdraftAmount;
    } catch (error) {
      console.error("Failed to debit Convex credits", {
        userId: ctx.userId,
        requestId: args.requestId,
        messageId: args.messageId,
        error: getErrorText(error),
      });
    }

    return {
      eventId,
      credits: charge.credits,
      tier: subscriptionState.tier,
      debitId,
      overdraftAmount,
    };
  },
});

export const internal_createCreditTopUpIntent = internalMutation({
  args: {
    userId: v.string(),
    amountCents: v.number(),
    credits: v.number(),
  },
  handler: async (ctx, args): Promise<CreditTopUpIntent> => {
    const now = Date.now();
    const intent = {
      intentId: crypto.randomUUID(),
      userId: args.userId,
      amountCents: args.amountCents,
      currency: "usd" as const,
      credits: args.credits,
      status: "created" as const,
      stripeCheckoutSessionId: undefined,
      stripePaymentIntentId: undefined,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.db.insert("creditTopUpIntents", intent);
    return intent;
  },
});

export const internal_markCreditTopUpCheckoutCreated = internalMutation({
  args: {
    intentId: v.string(),
    userId: v.string(),
    stripeCheckoutSessionId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const intent = await getCreditTopUpIntentDoc(ctx, args.intentId);
    if (intent?.userId !== args.userId) {
      throw new Error("Credit top-up intent not found.");
    }

    await ctx.db.patch(intent._id, {
      status: "checkout_created",
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const internal_markCreditTopUpIntentFailed = internalMutation({
  args: {
    intentId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const intent = await getCreditTopUpIntentDoc(ctx, args.intentId);
    if (intent?.userId !== args.userId || intent.status === "paid") {
      return { ok: true };
    }

    await ctx.db.patch(intent._id, {
      status: "failed",
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const internal_getCreditTopUpIntentByIntentId = internalQuery({
  args: { intentId: v.string() },
  handler: async (ctx, args): Promise<CreditTopUpIntent | null> => {
    const intent = await ctx.db
      .query("creditTopUpIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId))
      .unique();

    if (!intent) {
      return null;
    }

    return {
      intentId: intent.intentId,
      userId: intent.userId,
      amountCents: intent.amountCents,
      currency: intent.currency,
      credits: intent.credits,
      status: intent.status,
      stripeCheckoutSessionId: intent.stripeCheckoutSessionId,
      stripePaymentIntentId: intent.stripePaymentIntentId,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    };
  },
});

export const internal_markCreditTopUpIntentPaid = internalMutation({
  args: {
    intentId: v.string(),
    userId: v.string(),
    stripePaymentIntentId: v.string(),
    stripeCheckoutSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true; alreadyPaid: boolean }> => {
    const intent = await getCreditTopUpIntentDoc(ctx, args.intentId);
    if (intent?.userId !== args.userId) {
      throw new Error("Credit top-up intent not found.");
    }

    if (intent.status === "paid") {
      return { ok: true, alreadyPaid: true };
    }

    await ctx.db.patch(intent._id, {
      status: "paid",
      stripePaymentIntentId: args.stripePaymentIntentId,
      stripeCheckoutSessionId:
        args.stripeCheckoutSessionId ?? intent.stripeCheckoutSessionId,
      updatedAt: Date.now(),
    });

    return { ok: true, alreadyPaid: false };
  },
});

async function refreshBillingStateForUser(
  ctx: BillingActionCtx,
  userId: string,
): Promise<BillingRefreshResult> {
  const subscriptionState = await resolveCurrentSubscriptionStateWithFallback(
    ctx,
    userId,
  );
  await ensureStripeCustomerForCurrentUser(ctx);
  const periodKey = getPeriodKeyForTier(subscriptionState);
  const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());

  let grantApplied = false;
  if (subscriptionState.tier === "free") {
    try {
      const grant = await ctx.runMutation(
        internal.functions.credits.internal_ensureMonthlyFreeCredits,
        { userId, tier: subscriptionState.tier },
      );
      grantApplied = grant.created === true;
    } catch (error) {
      console.error("free_monthly_grant_failed", {
        userId,
        error: getErrorText(error),
      });
    }
  }

  const balance = await ctx.runQuery(
    internal.functions.credits.internal_getBalance,
    { userId },
  );

  const snapshot = subscriptionState.subscription;
  let subscriptionSchedule: BillingSubscriptionSchedule = {
    cancelAtPeriodEnd: snapshot?.cancelAtPeriodEnd === true,
    pendingPriceId: undefined,
    pendingAppliesAtMs: undefined,
  };

  const subscriptionId = snapshot?.subscriptionId;
  if (subscriptionId) {
    try {
      const stripe = getStripeSdkClient();
      const liveSub = await withTimeout(
        stripe.subscriptions.retrieve(subscriptionId),
        STRIPE_NETWORK_TIMEOUT_MS,
        "stripe.subscriptions.retrieve",
      );
      subscriptionSchedule =
        subscriptionScheduleFromStripeSubscription(liveSub);
    } catch (error) {
      console.error("Failed to load Stripe subscription schedule", {
        userId,
        subscriptionId,
        error: getErrorText(error),
      });
    }
  }

  return {
    tier: subscriptionState.tier,
    availableCredits: balance.spendableCredits,
    overageCredits: 0,
    spendableCredits: balance.spendableCredits,
    bucketBalances: balance.bucketBalances,
    expiringSoon: balance.expiringSoon,
    overageAllowed: plan.overageAllowed,
    grantApplied,
    periodKey,
    subscriptionSchedule,
  };
}

async function resolveCurrentSubscriptionState(
  ctx: GenericQueryCtx<DataModel> | BillingActionCtx,
  userId: string,
): Promise<BillingSubscriptionState> {
  const subscriptions = await ctx.runQuery(
    components.stripe.public.listSubscriptionsByUserId,
    { userId },
  );

  return selectBestSubscriptionState(subscriptions);
}

async function resolveCurrentSubscriptionStateWithFallback(
  ctx: BillingActionCtx,
  userId: string,
): Promise<BillingSubscriptionState> {
  try {
    return await withTimeout(
      resolveCurrentSubscriptionState(ctx, userId),
      STRIPE_NETWORK_TIMEOUT_MS,
      "resolveCurrentSubscriptionState",
    );
  } catch (error) {
    console.error("billing_subscription_resolution_failed", {
      userId,
      error: getErrorText(error),
    });

    return {
      tier: "free",
      subscription: null,
    };
  }
}

function selectBestSubscriptionState(
  subscriptions: unknown[],
): BillingSubscriptionState {
  return subscriptions.reduce<BillingSubscriptionState>(
    (best, candidate) => {
      const subscription = toSubscriptionSnapshot(candidate);
      if (!isPaidSubscriptionStatus(subscription?.status)) {
        return best;
      }
      const tier = resolveTierFromSubscription(subscription);
      return planTierRank(tier) > planTierRank(best.tier)
        ? { tier, subscription }
        : best;
    },
    { tier: "free", subscription: null },
  );
}

export async function ensureStripeCustomerForCurrentUser(
  ctx: BillingActionCtx,
) {
  const user = await ctx.runQuery(
    api.functions.user.getCurrentUserBillingInfo,
    {},
  );
  const override = await ctx.runQuery(
    internal.functions.billing.internal_getStripeCustomerOverride,
    { userId: user.userId },
  );
  if (override && (await stripeCustomerExists(override.stripeCustomerId))) {
    return override.stripeCustomerId;
  }

  const customer = await stripeComponent.getOrCreateCustomer(ctx, {
    userId: user.userId,
    email: user.email,
    name: user.name,
  });
  if (await stripeCustomerExists(customer.customerId)) {
    await ctx.runMutation(
      internal.functions.billing.internal_upsertStripeCustomerOverride,
      {
        userId: user.userId,
        stripeCustomerId: customer.customerId,
        email: user.email,
      },
    );
    return customer.customerId;
  }

  const stripe = getStripeSdkClient();
  const replacement = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.userId },
  });
  await ctx.runMutation(components.stripe.public.createOrUpdateCustomer, {
    stripeCustomerId: replacement.id,
    email: user.email,
    name: user.name,
    metadata: { userId: user.userId },
  });
  await ctx.runMutation(
    internal.functions.billing.internal_upsertStripeCustomerOverride,
    {
      userId: user.userId,
      stripeCustomerId: replacement.id,
      email: user.email,
    },
  );
  return replacement.id;
}

export const internal_getStripeCustomerOverride = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeCustomerOverrides")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const internal_upsertStripeCustomerOverride = internalMutation({
  args: {
    userId: v.string(),
    stripeCustomerId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const now = Date.now();
    const existing = await ctx.db
      .query("stripeCustomerOverrides")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        email: args.email,
        updatedAt: now,
      });
      return { ok: true };
    }

    await ctx.db.insert("stripeCustomerOverrides", {
      userId: args.userId,
      stripeCustomerId: args.stripeCustomerId,
      email: args.email,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

async function stripeCustomerExists(
  stripeCustomerId: string,
): Promise<boolean> {
  try {
    const stripe = getStripeSdkClient();
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    return !("deleted" in customer && customer.deleted === true);
  } catch (error) {
    const text = getErrorText(error).toLowerCase();
    if (
      text.includes("no such customer") ||
      text.includes("resource_missing")
    ) {
      return false;
    }
    throw error;
  }
}

async function getCreditTopUpIntentDoc(
  ctx: {
    db: {
      query: GenericQueryCtx<DataModel>["db"]["query"];
    };
  },
  intentId: string,
) {
  return await ctx.db
    .query("creditTopUpIntents")
    .withIndex("by_intentId", (q) => q.eq("intentId", intentId))
    .unique();
}

async function createOrReplaceDowngradeSchedule(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  args: {
    currentPriceId: string;
    targetPriceId: string;
    currentPeriodEnd: number;
    userId: string;
    targetTier: PlanTier;
  },
) {
  const currentItem = subscription.items.data[0];
  const currentPeriodStart = currentItem?.current_period_start;
  const scheduleId =
    typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule?.id;
  if (scheduleId) {
    await withTimeout(
      stripe.subscriptionSchedules.release(scheduleId),
      STRIPE_NETWORK_TIMEOUT_MS,
      "stripe.subscriptionSchedules.release",
    );
  }

  const schedule = await withTimeout(
    stripe.subscriptionSchedules.create({
      from_subscription: subscription.id,
    }),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.subscriptionSchedules.create",
  );

  await withTimeout(
    stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          start_date: currentPeriodStart ?? "now",
          items: [
            {
              price: args.currentPriceId,
              quantity: currentItem?.quantity ?? 1,
            },
          ],
          end_date: args.currentPeriodEnd,
          metadata: {
            ...subscription.metadata,
            userId: args.userId,
            priceId: args.currentPriceId,
          },
        },
        {
          items: [
            {
              price: args.targetPriceId,
              quantity: currentItem?.quantity ?? 1,
            },
          ],
          metadata: {
            userId: args.userId,
            priceId: args.targetPriceId,
            tier: args.targetTier,
          },
          proration_behavior: "none",
        },
      ],
      proration_behavior: "none",
    }),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.subscriptionSchedules.update",
  );

  await withTimeout(
    stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        userId: args.userId,
        pendingPriceId: args.targetPriceId,
        pendingAppliesAtMs: String(args.currentPeriodEnd * 1000),
      },
    }),
    STRIPE_NETWORK_TIMEOUT_MS,
    "stripe.subscriptions.update",
  );
}

async function syncStripeSubscriptionToConvex(
  ctx: BillingActionCtx,
  subscription: Stripe.Subscription,
): Promise<void> {
  const item = subscription.items.data[0];
  await ctx.runMutation(components.stripe.private.handleSubscriptionUpdated, {
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: item?.current_period_end ?? 0,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    cancelAt: subscription.cancel_at ?? undefined,
    quantity: item?.quantity ?? 1,
    priceId: item?.price?.id,
    metadata: subscription.metadata || {},
  });
}

async function upsertSubscriptionMonthlyAllowance(
  ctx: BillingActionCtx,
  subscription: Stripe.Subscription,
  tier: PlanTier,
): Promise<void> {
  const item = subscription.items.data[0];
  if (!item?.current_period_start || !item.current_period_end) {
    return;
  }

  const plan = getPlanConfig(tier, getBillingConfig());
  const periodStart = item.current_period_start * 1000;
  const periodEnd = item.current_period_end * 1000;

  await ctx.runMutation(
    internal.functions.credits.internal_upsertSubscriptionMonthlyCredits,
    {
      userId: ctx.userId,
      amount: plan.includedMonthlyCredits,
      sourceId: `${subscription.id}:${periodStart}`,
      periodKey: new Date(periodStart).toISOString().slice(0, 7),
      expiresAt: periodEnd,
      metadata: {
        subscriptionId: subscription.id,
        tier,
        priceId: item.price.id,
      },
    },
  );
}

function getPeriodKeyForTier(subscriptionState: BillingSubscriptionState) {
  if (
    subscriptionState.tier !== "free" &&
    subscriptionState.subscription?.currentPeriodStart !== undefined
  ) {
    return getBillingPeriodKey(
      subscriptionState.subscription.currentPeriodStart,
    );
  }

  return getBillingPeriodKey();
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

function isStripeProrationLine(line: Stripe.InvoiceLineItem): boolean {
  return (
    line.parent?.subscription_item_details?.proration === true ||
    line.parent?.invoice_item_details?.proration === true
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

void internal;
void api;
void stripeLiveSubscriptionPriceId;
