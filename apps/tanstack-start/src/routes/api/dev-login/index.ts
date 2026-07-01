import { createFileRoute } from "@tanstack/react-router";

import { isDevLoginEnabled, notFound } from "@/server/dev-login";

// `/api/dev-login` is a convenience alias that redirects to the admin login.
function redirectToAdmin() {
  if (!isDevLoginEnabled()) {
    return notFound();
  }
  return new Response(null, {
    status: 302,
    headers: { Location: "/api/dev-login/admin" },
  });
}

export const Route = createFileRoute("/api/dev-login/")({
  server: {
    handlers: {
      GET: () => redirectToAdmin(),
      POST: () => redirectToAdmin(),
    },
  },
});
