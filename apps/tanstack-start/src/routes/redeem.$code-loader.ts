import { ConvexHttpClient } from "convex/browser";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";

type PublicPromotionPayload =
  (typeof api.functions.promotions.getPublicPromotionByCode)["_returnType"];

export async function loadPublicPromotion(
  code: string,
): Promise<PublicPromotionPayload | null> {
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  return await client
    .query(api.functions.promotions.getPublicPromotionByCode, { code })
    .catch(() => null);
}
