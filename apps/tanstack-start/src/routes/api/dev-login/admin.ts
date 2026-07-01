import { createFileRoute } from "@tanstack/react-router";

import { DEV_ACCOUNTS, devLoginResponse } from "@/server/dev-login";

export const Route = createFileRoute("/api/dev-login/admin")({
  server: {
    handlers: {
      GET: ({ request }) => devLoginResponse(request, DEV_ACCOUNTS.admin),
      POST: ({ request }) => devLoginResponse(request, DEV_ACCOUNTS.admin),
    },
  },
});
