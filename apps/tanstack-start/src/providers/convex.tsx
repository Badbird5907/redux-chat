"use client";

import type { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { authClient } from "@/auth/client";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { env } from "@/env";

const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}