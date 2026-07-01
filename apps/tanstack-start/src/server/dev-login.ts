import { ConvexHttpClient } from "convex/browser";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { handler } from "@/lib/auth/server";

// Fixed dev-only accounts. These routes are disabled in production builds.
export interface DevAccount {
  name: string;
  email: string;
  password: string;
  admin: boolean;
}

export const DEV_ACCOUNTS = {
  admin: {
    name: "Dev Admin",
    email: "dev-admin@local.test",
    password: "dev-admin-12345!",
    admin: true,
  },
  user: {
    name: "Dev User",
    email: "dev-user@local.test",
    password: "dev-user-12345!",
    admin: false,
  },
} satisfies Record<string, DevAccount>;

export function isDevLoginEnabled() {
  return env.NODE_ENV !== "production";
}

export function notFound() {
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

/**
 * Provision (if missing) and sign in the given dev account, then redirect to `/`.
 * Existing accounts are detected first so creation is skipped. Disabled in prod.
 */
export async function devLoginResponse(
  request: Request,
  account: DevAccount,
): Promise<Response> {
  if (!isDevLoginEnabled()) {
    return notFound();
  }

  const origin = new URL(request.url).origin;
  const convex = new ConvexHttpClient(env.VITE_CONVEX_URL);

  // Duplicate check (+ admin elevation when requested). Gated on the backend by
  // INTERNAL_CONVEX_SECRET and a local-deployment check.
  const { existed } = await convex.mutation(
    api.functions.devAuth.ensureDevAccount,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      email: account.email,
      admin: account.admin,
    },
  );

  let authResponse: Response;
  if (existed) {
    // Account already exists — skip creation and just sign in.
    authResponse = await postAuth(origin, "/api/auth/sign-in/email", {
      email: account.email,
      password: account.password,
    });
  } else {
    // Provision the account (Better Auth auto-signs in).
    authResponse = await postAuth(origin, "/api/auth/sign-up/email", {
      name: account.name,
      email: account.email,
      password: account.password,
    });
    // Elevate to admin only for admin accounts, once the user exists.
    if (authResponse.ok && account.admin) {
      await convex.mutation(api.functions.devAuth.ensureDevAccount, {
        secret: env.INTERNAL_CONVEX_SECRET,
        email: account.email,
        admin: true,
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
