import { v } from "convex/values";
import { query, mutation } from "./index";
import { authComponent } from "../auth";
import { backendEnv } from "../env";

export const getUserImage = query({
    args: {
        userId: v.optional(v.string()),
    },
    handler: async (ctx, { userId }) => {
        let target = null;
        
        if (userId && userId !== "me") {
            // @ts-expect-error works fine
            target = await authComponent.getAnyUserById(ctx, userId);
        } else {
            target = ctx.user;
        }

        if (!target) {
            throw new Error("User not found");
        }

        if (target.image) {
            if (target.image.startsWith("http")) {
                return { image: target.image };
            }
            const env = backendEnv();
            return { image: `${env.NEXT_PUBLIC_S3_AVATARS_URL}/${target._id}/avatar/${target.image}` };
        }
        return { image: null };
    }
})

export const testMutation = mutation({
    handler: () => {
        return "test";
    }
})
export const testQuery = query({
    handler: () => {
        return "testQuery";
    }
})