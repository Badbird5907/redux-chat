import { Polar } from "@convex-dev/polar";

import type { DataModel } from "./_generated/dataModel";
import { api, components } from "./_generated/api";

export const polar: Polar<DataModel> = new Polar<DataModel>(components.polar, {
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
