import { Buffer } from "buffer/";
import { v } from "convex/values";

import { authComponent } from "../auth";
import { backendEnv } from "../env";
import { query } from "./index";

export const getUserImage = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { userId }) => {
    if (userId && userId !== "me" && userId !== ctx.userId) {
      throw new Error("User not found");
    }

    const target = await authComponent.getAuthUser(ctx);

    if (typeof target.image === "string" && target.image) {
      if (target.image.startsWith("http")) {
        return { image: target.image };
      }
      const env = backendEnv();
      return {
        image: `${env.VITE_S3_AVATARS_URL}/${target._id}/avatar/${target.image}`,
      };
    }
    return { image: null };
  },
});

async function importKey(secret: string, enc: TextEncoder): Promise<CryptoKey> {
  const keyData = enc.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export const verifySignature = async (
  message: string,
  signature: string,
  enc: TextEncoder,
): Promise<boolean> => {
  const env = backendEnv();
  const key = await importKey(env.INTERNAL_CONVEX_SECRET, enc);
  const messageData = enc.encode(message);
  const signatureBuffer = Buffer.from(signature, "base64");

  return crypto.subtle.verify("HMAC", key, signatureBuffer, messageData);
};
export const getCurrentUserId = query({
  handler: (_ctx) => {
    return { userId: _ctx.userId };
  },
});

export const getCurrentUserPolarInfo = query({
  handler: async (ctx) => {
    const user = await authComponent.getAnyUserById(ctx, ctx.userId);
    if (!user?.email) {
      throw new Error("Authenticated user is missing an email address");
    }

    return {
      userId: ctx.userId,
      email: user.email,
    };
  },
});
