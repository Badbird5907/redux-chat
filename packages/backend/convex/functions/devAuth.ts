import { ConvexError, v } from "convex/values";

import { initAuth } from "../auth";
import { backendEnv } from "../env";
import { backendMutation } from "./index";

/** Better Auth stores roles as a comma-separated string; default to ["user"]. */
function rolesFromAuthRoleField(role: string | null | undefined): string[] {
  if (role == null || role === "") {
    return ["user"];
  }
  return role
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/** Only allow the dev-login helper against a local (non-production) deployment. */
function assertLocalDeployment() {
  const siteUrl = backendEnv().SITE_URL;
  const isLocal =
    siteUrl.startsWith("http://localhost") ||
    siteUrl.startsWith("http://127.0.0.1");
  if (!isLocal) {
    throw new ConvexError(
      "ensureDevAdmin is only available on local development deployments",
    );
  }
}

/**
 * Dev-only helper used by the `/api/dev-login` route. Looks up a Better Auth
 * user by email (duplicate check) and, if it exists, ensures it has the "admin"
 * role. Account *creation* is intentionally handled by the app route via the
 * normal Better Auth sign-up endpoint so the browser session cookie is set.
 *
 * Protected by `backendMutation` (requires INTERNAL_CONVEX_SECRET) and gated to
 * local deployments only.
 */
export const ensureDevAdmin = backendMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    assertLocalDeployment();

    const auth = initAuth(ctx);
    const { adapter } = await auth.$context;

    const existing = await adapter.findOne<{
      id: string;
      email: string;
      role?: string | null;
    }>({
      model: "user",
      where: [{ field: "email", value: email }],
    });

    // Duplicate check: if the account does not exist yet, report it so the
    // caller can create it. Skip any creation here.
    if (!existing) {
      return { existed: false, isAdmin: false };
    }

    const roles = rolesFromAuthRoleField(existing.role);
    if (!roles.includes("admin")) {
      await adapter.update({
        model: "user",
        where: [{ field: "email", value: email }],
        update: { role: Array.from(new Set([...roles, "admin"])).join(",") },
      });
    }

    return { existed: true, isAdmin: true };
  },
});
