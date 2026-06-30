import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { handler } from "@/lib/auth/server";

// Fixed dev-only admin account. This route is disabled in production builds.
const DEV_ADMIN_NAME = "Dev Admin";
const DEV_ADMIN_EMAIL = "dev-admin@local.test";
const DEV_ADMIN_PASSWORD = "dev-admin-12345!";

function notFound() {
  return new Response("Not Found", { status: 404 });
}

async function postAuth(origin: string, path: string, body: unknown) {
  return handler(
    new Request(`${origin}${path}`, {
      method: "POST",
      // Better Auth enforces a trusted Origin header (CSRF protection), so mirror
      // the app origin on these server-constructed requests.
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Build a redirect that carries over the Set-Cookie headers from an auth response. */
function redirectWithCookies(authResponse: Response, location: string) {
  const response = new Response(null, {
    status: 303,
    headers: { Location: location },
  });
  for (const cookie of authResponse.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

async function devLogin(request: Request): Promise<Response> {
  // Hard gate: never expose this in production.
  if (env.NODE_ENV === "production") {
    return notFound();
  }

  const origin = new URL(request.url).origin;
  const convex = new ConvexHttpClient(env.VITE_CONVEX_URL);

  // Duplicate check (+ admin elevation if the account already exists). Gated on
  // the backend by INTERNAL_CONVEX_SECRET and a local-deployment check.
  const { existed } = await convex.mutation(api.functions.devAuth.ensureDevAdmin, {
    secret: env.INTERNAL_CONVEX_SECRET,
    email: DEV_ADMIN_EMAIL,
  });

  let authResponse: Response;
  if (existed) {
    // Account already exists — skip creation and just sign in.
    authResponse = await postAuth(origin, "/api/auth/sign-in/email", {
      email: DEV_ADMIN_EMAIL,
      password: DEV_ADMIN_PASSWORD,
    });
  } else {
    // Provision the account (Better Auth auto-signs in), then elevate to admin.
    authResponse = await postAuth(origin, "/api/auth/sign-up/email", {
      name: DEV_ADMIN_NAME,
      email: DEV_ADMIN_EMAIL,
      password: DEV_ADMIN_PASSWORD,
    });
    if (authResponse.ok) {
      await convex.mutation(api.functions.devAuth.ensureDevAdmin, {
        secret: env.INTERNAL_CONVEX_SECRET,
        email: DEV_ADMIN_EMAIL,
      });
    }
  }

  if (!authResponse.ok) {
    const detail = await authResponse.text();
    return new Response(`Dev login failed (${authResponse.status}): ${detail}`, {
      status: 500,
    });
  }

  return redirectWithCookies(authResponse, "/");
}

export const Route = createFileRoute("/api/dev-login")({
  server: {
    handlers: {
      GET: ({ request }) => devLogin(request),
      POST: ({ request }) => devLogin(request),
    },
  },
});
