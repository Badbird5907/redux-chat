import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { authComponent, initAuth } from "./auth";
import { polar } from "./polar";

const http = httpRouter();

authComponent.registerRoutes(http, initAuth);
polar.registerRoutes(http, {
  events: {
    "subscription.created": async (ctx, event) => {
      const userId = event.data.customer.externalId;
      if (!userId) {
        return;
      }

      await ctx.runMutation(
        internal.functions.billing.internal_syncBillingAccountFromSubscription,
        {
          userId,
          productId: event.data.productId,
          status: event.data.status,
          polarCustomerId: event.data.customerId,
          polarSubscriptionId: event.data.id,
          currentPeriodStart: event.data.currentPeriodStart.getTime(),
          currentPeriodEnd: event.data.currentPeriodEnd.getTime(),
        },
      );
    },
    "subscription.updated": async (ctx, event) => {
      const userId = event.data.customer.externalId;
      if (!userId) {
        return;
      }

      await ctx.runMutation(
        internal.functions.billing.internal_syncBillingAccountFromSubscription,
        {
          userId,
          productId: event.data.productId,
          status: event.data.status,
          polarCustomerId: event.data.customerId,
          polarSubscriptionId: event.data.id,
          currentPeriodStart: event.data.currentPeriodStart.getTime(),
          currentPeriodEnd: event.data.currentPeriodEnd.getTime(),
        },
      );
    },
  },
});

export default http;
