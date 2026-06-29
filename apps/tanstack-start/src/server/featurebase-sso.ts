import crypto from "crypto";
import { createServerFn } from "@tanstack/react-start";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthQuery } from "@/lib/auth/server";

const FEATUREBASE_ORG = "reduxchat";
const FEATUREBASE_PORTAL_URL = `https://${FEATUREBASE_ORG}.featurebase.app`;

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${body}.${signature}`;
}

export const getFeaturebaseSsoUrl = createServerFn({ method: "GET" }).handler(
  async () => {
    const secret = env.FEATUREBASE_JWT_SECRET;
    if (!secret) {
      return { url: FEATUREBASE_PORTAL_URL, authenticated: false };
    }

    const user = await fetchAuthQuery(
      api.functions.user.getCurrentUserBillingInfo,
      {},
    );

    const jwt = signJwt(
      {
        email: user.email,
        name: user.name ?? undefined,
        userId: user.userId,
        iat: Math.floor(Date.now() / 1000),
      },
      secret,
    );

    const url = `${FEATUREBASE_PORTAL_URL}/api/v1/auth/access/jwt?jwt=${jwt}&return_to=${encodeURIComponent(FEATUREBASE_PORTAL_URL)}`;

    return { url, authenticated: true };
  },
);
