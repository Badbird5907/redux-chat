import crypto from "crypto";
import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { getToken } from "@/lib/auth/server";

const FEATUREBASE_ORG = "reduxchat";
const FEATUREBASE_PORTAL_URL = `https://${FEATUREBASE_ORG}.featurebase.app`;

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
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

export const Route = createFileRoute("/api/sso/featurebase")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const returnTo =
          url.searchParams.get("return_to") ?? FEATUREBASE_PORTAL_URL;

        const secret = env.FEATUREBASE_JWT_SECRET;
        if (!secret) {
          return Response.redirect(returnTo, 302);
        }

        const token = await getToken();
        if (!token) {
          return Response.redirect(returnTo, 302);
        }

        const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
        client.setAuth(token);

        let user: { userId: string; email: string; name?: string };
        try {
          user = await client.query(
            api.functions.user.getCurrentUserBillingInfo,
            {},
          );
        } catch {
          return Response.redirect(returnTo, 302);
        }

        const jwt = signJwt(
          {
            email: user.email,
            name: user.name ?? undefined,
            userId: user.userId,
            iat: Math.floor(Date.now() / 1000),
          },
          secret,
        );

        const redirectUrl = `${FEATUREBASE_PORTAL_URL}/api/v1/auth/access/jwt?jwt=${jwt}&return_to=${encodeURIComponent(returnTo)}`;
        return Response.redirect(redirectUrl, 302);
      },
    },
  },
});
