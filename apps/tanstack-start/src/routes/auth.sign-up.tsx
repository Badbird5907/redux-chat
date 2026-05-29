import { createFileRoute, redirect } from "@tanstack/react-router";

import { sanitizeAuthRedirect } from "@/lib/auth/redirect";
import { SignUpPage } from "./auth.sign-up.route-component";

export const Route = createFileRoute("/auth/sign-up")({
  validateSearch: (search): { next?: string } => {
    if (typeof search.next !== "string") {
      return {};
    }
    return { next: sanitizeAuthRedirect(search.next) };
  },
  beforeLoad: ({ context, search }) => {
    if (context.isAuthenticated) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: sanitizeAuthRedirect(search.next) });
    }
  },
  component: SignUpPage,
});
