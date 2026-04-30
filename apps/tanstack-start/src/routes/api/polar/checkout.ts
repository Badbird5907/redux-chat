import type { StartAPIMethodCallback } from "@tanstack/react-start/api";
import { Checkout } from "@polar-sh/tanstack-start";
import { createFileRoute } from "@tanstack/react-router";

import { getPolarCheckoutConfig } from "@/lib/polar/server";

const handleCheckout: StartAPIMethodCallback<"/api/polar/checkout"> = Checkout(
  getPolarCheckoutConfig(),
);

export const Route = createFileRoute("/api/polar/checkout")({
  server: {
    handlers: {
      GET: handleCheckout,
    },
  },
});
