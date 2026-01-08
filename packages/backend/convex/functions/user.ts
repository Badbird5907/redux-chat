import { v } from "convex/values";
import { query, mutation } from "./index";
import { authComponent } from "../auth";
import { backendEnv } from "../env";
import { Buffer } from "buffer/";

export const getUserImage = query({
    args: {
        userId: v.optional(v.string()),
    },
    handler: async (ctx, { userId }) => {
        let target = null;
        
        if (userId && userId !== "me") {
            target = await authComponent.getAnyUserById(ctx, userId);
        } else {
            target = await authComponent.getAuthUser(ctx);
        }

        if (!target) {
            throw new Error("User not found");
        }

        if (typeof target.image === "string" && target.image) {
            if (target.image.startsWith("http")) {
                return { image: target.image };
            }
            const env = backendEnv();
            return { image: `${env.VITE_S3_AVATARS_URL}/${target._id}/avatar/${target.image}` };
        }
        return { image: null };
    }
})

export const testMutation = mutation({
    handler: (ctx) => {
        return ctx.user;
    }
})


async function importKey(secret: string, enc: TextEncoder): Promise<CryptoKey> {
    const keyData = enc.encode(secret);
    return crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

export const verifySignature = async (
    message: string,
    signature: string,
    enc: TextEncoder
    ): Promise<boolean> => {
    const env = backendEnv();
    const key = await importKey(env.INTERNAL_CONVEX_SECRET, enc);
    const messageData = enc.encode(message);
    const signatureBuffer = Buffer.from(signature, "base64");

    return crypto.subtle.verify("HMAC", key, signatureBuffer, messageData);
};
export const testQuery = query({
    handler: () => {
        return "testQuery";
    }
})