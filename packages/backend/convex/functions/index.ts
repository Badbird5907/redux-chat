import type {
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import { ConvexError, v } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import {
  action as rawAction,
  mutation as rawMutation,
  query as rawQuery,
} from "../_generated/server";
import { backendEnv } from "../env";

const triggers = new Triggers<DataModel>();

triggers.register("threads", async (ctx, change) => {
  if (change.operation === "update") {
    const newDoc = change.newDoc as unknown;
    if (newDoc && typeof newDoc === "object" && "updatedAt" in newDoc) {
      const now = Date.now();
      const updatedAt = (newDoc as { updatedAt: number }).updatedAt;
      if (updatedAt !== now) {
        await ctx.db.patch(change.id, { updatedAt: now });
      }
    }
  }
});

// Custom query that requires auth and injects ctx.user
export const query = customQuery(
  rawQuery,
  customCtx(async (ctx: GenericQueryCtx<DataModel>) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new ConvexError("Unauthorized");
    }
    return { user, userId: user.subject }; // merged into ctx
  }),
);

// Custom mutation that requires auth and injects ctx.user
export const mutation = customMutation(
  rawMutation,
  customCtx(async (ctx: GenericMutationCtx<DataModel>) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new ConvexError("Unauthorized");
    }
    return { user, userId: user.subject }; // merged into ctx
  }),
);

export const action = customAction(
  rawAction,
  customCtx(async (ctx: GenericActionCtx<DataModel>) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new ConvexError("Unauthorized");
    }
    return { user, userId: user.subject };
  }),
);

const enforceInternalSecret = {
  args: { secret: v.string() },
  input: (
    _ctx:
      | GenericMutationCtx<DataModel>
      | GenericQueryCtx<DataModel>
      | GenericActionCtx<DataModel>,
    { secret }: { secret: string },
  ) => {
    const env = backendEnv();
    if (secret !== env.INTERNAL_CONVEX_SECRET) {
      throw new ConvexError("Invalid secret");
    }
    return { ctx: {}, args: {} };
  },
};

export const backendMutation = customMutation(
  rawMutation,
  enforceInternalSecret,
);

export const backendQuery = customQuery(rawQuery, enforceInternalSecret);

export const backendAction = customAction(rawAction, enforceInternalSecret);
