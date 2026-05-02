import { httpRouter } from "convex/server";

import { authComponent, initAuth } from "./auth";
import { polar } from "./polar";
import { backendEnv } from "./env";
import { getPolarSdkClient } from "./billing";

const http = httpRouter();

authComponent.registerRoutes(http, initAuth);
polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
    "subscription.canceled": async (ctx, event) => {
      console.log("subscription.canceled", event);
      const env = backendEnv();
      const { productId } = event.data;
      const polarSdk = getPolarSdkClient();
      if (productId === env.POLAR_FREE_PRODUCT_ID) {
        console.log("free subscription canceled");
        // this is here so that the user can't cancel their free subscription
        // and then if we give them a free sub again they get more credits or something

        // uncancel the subscription
        await polarSdk.subscriptions.update({
          id: event.data.id,
          subscriptionUpdate: {
            cancelAtPeriodEnd: false, // oh no you don't >:(
          },
        });
        // maybe this is still possible to break at the exact right time?
        // honestly idc
      } else if (productId === env.POLAR_PLUS_PRODUCT_ID || productId === env.POLAR_PRO_PRODUCT_ID) {
        console.log("paid subscription canceled");
        // give them free sub
        // await polarSdk.subscriptions.create({
        //   productId: env.POLAR_FREE_PRODUCT_ID,
        //   customerId: event.data.customerId,
        // })
        // nvm thats stupid
      }
    },
    // "subscription.revoked": async (ctx, event) => {
    //   console.log("subscription.revoked", event);
    // },
    // "subscription.updated": async (ctx, event) => {
    //   console.log("subscription.updated for", event.data.customerId);
    // },
  }
});

export default http;
