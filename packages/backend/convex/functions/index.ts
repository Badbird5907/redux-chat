import type { DataModel } from "../_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";

import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { query as rawQuery, mutation as rawMutation } from "../_generated/server";

const triggers = new Triggers<DataModel>()

triggers.register("threads", async (ctx, change) => {
  if (change.operation === "update") {
    const newDoc = change.newDoc as unknown;
    if (newDoc && typeof newDoc === "object" && "updatedAt" in newDoc) {
      const now = Date.now()
      const updatedAt = (newDoc as { updatedAt: number }).updatedAt;
      if (updatedAt !== now) {
        await ctx.db.patch(change.id, { updatedAt: now });
      }
    }
  }
})

export const query = customQuery(rawQuery, customCtx((original) => original))
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB)) 