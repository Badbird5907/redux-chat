import { Polar } from "@convex-dev/polar";

import type { DataModel } from "./_generated/dataModel";
import { api, components } from "./_generated/api";
import { backendEnv } from "./env";

const env = backendEnv();

export const polar: Polar<DataModel> = new Polar<DataModel>(components.polar, {
  products: {
    plus: env.POLAR_PLUS_PRODUCT_ID ?? "",
    pro: env.POLAR_PRO_PRODUCT_ID ?? "",
  },
  organizationToken: env.POLAR_ACCESS_TOKEN,
  webhookSecret: env.POLAR_WEBHOOK_SECRET as string,
  server: env.POLAR_SERVER,
  getUserInfo: async (ctx): Promise<{ userId: string; email: string }> =>
    await ctx.runQuery(api.functions.user.getCurrentUserPolarInfo, {}),
});

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();
