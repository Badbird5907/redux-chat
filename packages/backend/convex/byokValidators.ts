import { v } from "convex/values";

import { BYOK_PROVIDER_IDS } from "@redux/shared/models";

export const byokProviderValidator = v.union(
  ...BYOK_PROVIDER_IDS.map((provider) => v.literal(provider)),
);

export const modelRoutingOverrideValidator = v.union(
  v.object({
    modelId: v.string(),
    kind: v.literal("byok"),
    routeId: v.string(),
  }),
  v.object({
    modelId: v.string(),
    kind: v.literal("hosted"),
  }),
);
