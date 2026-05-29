import { createFileRoute } from "@tanstack/react-router";

import { SignOutPage } from "./auth.sign-out.route-component";

export const Route = createFileRoute("/auth/sign-out")({
  component: SignOutPage,
});
