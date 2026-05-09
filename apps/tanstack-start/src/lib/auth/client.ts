import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { auditLogClient } from "@redux/backend/convex/betterAuth/audit_log/client";

export const authClient = createAuthClient({
  plugins: [adminClient(), convexClient(), auditLogClient()],
});
