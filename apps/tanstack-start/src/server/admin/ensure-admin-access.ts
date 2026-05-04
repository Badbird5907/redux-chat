import { createServerFn } from "@tanstack/react-start";

import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthQuery } from "@/lib/auth/server";

export const fetchAdminDashboardAccess = createServerFn({
  method: "GET",
}).handler(async () => {
  return await fetchAuthQuery(api.functions.user.getAdminDashboardAccess, {});
});
